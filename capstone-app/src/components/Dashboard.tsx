import { useState, useRef, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  DollarSign, 
  Package, 
  ShoppingCart, 
  AlertTriangle, 
  Clock, 
  ChevronDown, 
  Flame, 
  BarChart3, 
  ShieldAlert 
} from "lucide-react";
import type { InventoryItem, Sale } from "../App";

interface DashboardProps {
  inventory: InventoryItem[];
  sales: Sale[];
  onSelectProduct?: (productName: string, productId?: string) => void;
  onSelectSale?: (saleId?: string) => void;
  isAdminUser?: boolean;
}

// Payment method badge configuration
const PAYMENT_BADGES: Record<string, { label: string; cls: string }> = {
  cash: { label: "CASH", cls: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  paymaya: { label: "PAYMAYA", cls: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700" },
  maya: { label: "PAYMAYA", cls: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700" },
  gcash: { label: "GCASH", cls: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  bdo: { label: "BDO", cls: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
  bpi: { label: "BPI", cls: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800" },
  card: { label: "CARD", cls: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800" },
};

function getPaymentBadge(sale: Sale) {
  const isCash = !sale.paymentMethod || sale.paymentMethod === "cash";
  if (isCash) return PAYMENT_BADGES.cash;

  const raw = (sale.onlineChannel || "").trim().toLowerCase();
  for (const [key, badge] of Object.entries(PAYMENT_BADGES)) {
    if (key !== "cash" && raw.includes(key)) return badge;
  }

  return {
    label: (sale.onlineChannel || "ONLINE").toUpperCase(),
    cls: "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800"
  };
}

export function Dashboard({
  inventory = [],
  sales = [],
  onSelectProduct,
  onSelectSale,
  isAdminUser = false
}: DashboardProps) {
  const [timeframe, setTimeframe] = useState<"today" | "week" | "month" | "year">("month");
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number; x: number; y: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number>(800);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const updateSize = () => {
      if (chartContainerRef.current) {
        const width = chartContainerRef.current.clientWidth;
        if (width > 0) setChartWidth(width);
      }
    };
    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const safeSales = Array.isArray(sales) ? sales : [];

  // Memoized KPI & Widget Calculations
  const {
    activeSales,
    todayRevenue,
    todayOrdersCount,
    totalRevenue,
    totalTransactions,
    costOfGoods,
    profit,
    avgOrderValue,
    totalInventoryValue,
    totalUnitsInStock,
    lowStockAlerts,
    nearlyExpiredProducts,
    topProducts,
    recentOrders
  } = useMemo(() => {
    const active = safeSales.filter(s => s && !s.isRefunded);
    const todayStr = new Date().toDateString();
    const nowMs = Date.now();

    // 1. KPI Metrics
    let todayRev = 0;
    let todayCount = 0;
    let totalRev = 0;

    active.forEach(s => {
      const tot = Number(s.total) || 0;
      totalRev += tot;
      if (s.date && new Date(s.date).toDateString() === todayStr) {
        todayRev += tot;
        todayCount++;
      }
    });

    const totalTrans = active.length;

    // Inventory lookup map for fast O(1) COGS and item lookups
    const invMap = new Map<string, InventoryItem>();
    let totalUnits = 0;
    let totalInvVal = 0;

    safeInventory.forEach(item => {
      if (!item) return;
      invMap.set(String(item.id), item);
      const stock = Number(item.stock) || 0;
      const price = Number(item.price) || 0;
      totalUnits += stock;
      totalInvVal += price * stock;
    });

    // COGS & Top Products
    let cogs = 0;
    const productSalesMap: Record<string, { name: string; quantity: number; revenue: number }> = {};

    active.forEach(sale => {
      const saleItems = Array.isArray(sale.items) ? sale.items : [];
      saleItems.forEach((si, idx) => {
        if (!si || !si.item) return;
        const matchedInv = invMap.get(String(si.item.id));
        const costPerUnit = Number(si.item.cost) || Number(matchedInv?.cost) || 0;
        const qty = Number(si.quantity) || 0;
        cogs += costPerUnit * qty;

        const itemId = String(si.item.id || si.item.name || `item-${idx}`);
        const activePrice = Number(si.item.price) || Number(matchedInv?.price) || 0;
        const lineRevenue = qty * activePrice;

        if (!productSalesMap[itemId]) {
          productSalesMap[itemId] = {
            name: si.item.name || matchedInv?.name || "Unknown Product",
            quantity: 0,
            revenue: 0
          };
        }
        productSalesMap[itemId].quantity += qty;
        productSalesMap[itemId].revenue += lineRevenue;
      });
    });

    const netProfit = totalRev - cogs;
    const avgOrder = totalTrans > 0 ? totalRev / totalTrans : 0;

    // 2. Widget Data: Low Stock Alerts
    const lowStock = safeInventory
      .filter(item => item && (Number(item.stock) || 0) <= (Number(item.minStock) || 10))
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));

    // 3. Widget Data: Nearly Expired Medicines
    const nearlyExpired = safeInventory
      .flatMap(item => 
        (Array.isArray(item.batches) ? item.batches : []).map(batch => ({
          name: item.name,
          category: item.category,
          expiryDate: batch.expiryDate,
          stock: Number(batch.stock) || 0,
          itemStock: Number(item.stock) || 0
        }))
      )
      .filter(b => Boolean(b.expiryDate) && b.stock > 0 && b.itemStock > 0)
      .map(b => {
        const diffTime = new Date(b.expiryDate).getTime() - nowMs;
        return { ...b, daysLeft: Math.ceil(diffTime / (1000 * 60 * 60 * 24)) };
      })
      .filter(b => b.daysLeft <= 180)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // 4. Widget Data: Top Product
    const topProd = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity);

    // 5. Widget Data: Recent Orders
    const recent = [...active].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    return {
      activeSales: active,
      todayRevenue: todayRev,
      todayOrdersCount: todayCount,
      totalRevenue: totalRev,
      totalTransactions: totalTrans,
      costOfGoods: cogs,
      profit: netProfit,
      avgOrderValue: avgOrder,
      totalInventoryValue: totalInvVal,
      totalUnitsInStock: totalUnits,
      lowStockAlerts: lowStock,
      nearlyExpiredProducts: nearlyExpired,
      topProducts: topProd,
      recentOrders: recent
    };
  }, [safeInventory, safeSales]);

  // 6. Memoized Graph Data Processing for Sales Overview
  const graphPoints = useMemo(() => {
    const now = new Date();

    if (timeframe === "today") {
      const slots = [
        { label: "8 AM", start: 8, end: 10 },
        { label: "10 AM", start: 10, end: 12 },
        { label: "12 PM", start: 12, end: 14 },
        { label: "2 PM", start: 14, end: 16 },
        { label: "4 PM", start: 16, end: 18 },
        { label: "6 PM", start: 18, end: 20 },
        { label: "8 PM+", start: 20, end: 24 }
      ];

      return slots.map(slot => {
        const val = activeSales
          .filter(s => {
            const d = new Date(s.date);
            return d.toDateString() === now.toDateString() && d.getHours() >= slot.start && d.getHours() < slot.end;
          })
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        return { label: slot.label, value: val };
      });
    }

    if (timeframe === "week") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(now.getDate() - (6 - i));
        const dayLabel = days[d.getDay()];
        const val = activeSales
          .filter(s => new Date(s.date).toDateString() === d.toDateString())
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        return { label: dayLabel, value: val };
      });
    }

    if (timeframe === "year") {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentYear = now.getFullYear();
      return months.map((m, idx) => {
        const val = activeSales
          .filter(s => {
            const d = new Date(s.date);
            return d.getFullYear() === currentYear && d.getMonth() === idx;
          })
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        return { label: m, value: val };
      });
    }

    // Default: "month" - 5 intervals covering the entire month up to the last day
    const currentMonthName = now.toLocaleString("en-US", { month: "short" });
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const intervals = [
      { label: `${currentMonthName} 1-7`, min: 1, max: 7 },
      { label: `${currentMonthName} 8-14`, min: 8, max: 14 },
      { label: `${currentMonthName} 15-21`, min: 15, max: 21 },
      { label: `${currentMonthName} 22-28`, min: 22, max: 28 },
      { label: `${currentMonthName} 29-${lastDayOfMonth}`, min: 29, max: lastDayOfMonth }
    ];

    return intervals.map(slot => {
      const val = activeSales
        .filter(s => {
          const d = new Date(s.date);
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() >= slot.min &&
            d.getDate() <= slot.max
          );
        })
        .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

      return { label: slot.label, value: val };
    });
  }, [activeSales, timeframe]);

  const maxVal = Math.max(...graphPoints.map(p => p.value), 100);

  // SVG Chart Geometry Specs
  const svgWidth = Math.max(chartWidth, 320);
  const svgHeight = 340;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 15;
  const paddingBottom = 25;

  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;

  // Round max scale up nicely for Y-axis labels
  const getScaleMax = (max: number) => {
    if (max <= 500) return 500;
    if (max <= 1000) return 1000;
    if (max <= 2500) return 2500;
    if (max <= 5000) return 5000;
    if (max <= 10000) return 10000;
    if (max <= 20000) return 20000;
    if (max <= 50000) return 50000;
    if (max <= 100000) return 100000;
    if (max <= 500000) return 500000;
    if (max <= 1000000) return 1000000;
    return Math.ceil(max / 100000) * 100000;
  };

  const scaleMax = getScaleMax(maxVal);

  const formatCurrencyLabel = (num: number) => {
    if (num >= 1000000) return `₱${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `₱${Math.round(num / 1000)}K`;
    return `₱${Math.round(num)}`;
  };

  // Build coordinates for SVG
  const pointsCoords = graphPoints.map((pt, idx) => {
    const x = paddingLeft + (idx / Math.max(graphPoints.length - 1, 1)) * chartW;
    const yRatio = pt.value / scaleMax;
    const y = paddingTop + chartH - yRatio * chartH;
    return { ...pt, x, y };
  });

  // Smooth SVG Path generator (Bezier curve)
  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const current = pts[i];
      const next = pts[i + 1];
      const controlX = (current.x + next.x) / 2;
      path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const linePath = buildSmoothPath(pointsCoords);
  const firstPt = pointsCoords[0] || { x: paddingLeft, y: paddingTop + chartH };
  const lastPt = pointsCoords[pointsCoords.length - 1] || { x: paddingLeft + chartW, y: paddingTop + chartH };
  const areaPath = `${linePath} L ${lastPt.x} ${paddingTop + chartH} L ${firstPt.x} ${paddingTop + chartH} Z`;

  // Y-axis grid ticks (5 horizontal lines)
  const yTicks = [1.0, 0.75, 0.5, 0.25, 0.0].map(ratio => ({
    ratio,
    val: scaleMax * ratio,
    y: paddingTop + chartH - ratio * chartH
  }));

  return (
    <div className="space-y-3 text-xs font-sans">
      {/* 1. Top 6 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {/* Today's Revenue */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between card-hover">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400 font-bold text-[11px]">Today's Revenue</span>
            <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-2xs">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
              ₱{todayRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-gray-400 dark:text-slate-400 text-[10px] font-medium mt-0.5">
              {todayOrdersCount} orders today
            </p>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between card-hover">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400 font-bold text-[11px]">Total Revenue</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
              ₱{totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-gray-400 dark:text-slate-400 text-[10px] font-medium mt-0.5">{totalTransactions} total sales</p>
          </div>
        </div>

        {/* Cost of Goods */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between card-hover">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400 font-bold text-[11px]">Cost of Goods</span>
            <div className="w-6 h-6 rounded-lg bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-2xs">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-gray-800 dark:text-slate-200 tracking-tight">
              ₱{costOfGoods.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-gray-400 dark:text-slate-400 text-[10px] font-medium mt-0.5">COGS Sold</p>
          </div>
        </div>

        {/* Profit */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between card-hover">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400 font-bold text-[11px]">Profit</span>
            <div className="w-6 h-6 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-2xs">
              <Flame className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
              ₱{profit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-gray-400 dark:text-slate-400 text-[10px] font-medium mt-0.5">Net Profit</p>
          </div>
        </div>

        {/* Avg Rev */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between card-hover">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400 font-bold text-[11px]">Avg Rev</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-2xs">
              <ShoppingCart className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
              ₱{avgOrderValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-gray-400 dark:text-slate-400 text-[10px] font-medium mt-0.5">Average revenue</p>
          </div>
        </div>

        {/* Inventory Value */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between card-hover">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400 font-bold text-[11px]">Inventory Value</span>
            <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-2xs">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
              ₱{totalInventoryValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-gray-400 dark:text-slate-400 text-[10px] font-medium mt-0.5">{totalUnitsInStock} total units</p>
          </div>
        </div>
      </div>

      {/* 2. Upper Grid: Top Product & Recent Order on Left (2), Sales Overview on Right (1) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Left Column: Top Product + Recent Order */}
        <div className="lg:col-span-5 space-y-3 flex flex-col justify-between">
          {/* Top Product */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-2xs border border-gray-100 dark:border-slate-700/80 space-y-2 flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b dark:border-slate-700/60 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight">Top Product</h2>
              </div>
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">
                Best Sellers
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {topProducts.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-center py-3 text-xs">No sales recorded yet.</p>
              ) : (
                topProducts.map((item, idx) => (
                  <div key={idx} className="bg-gray-50/70 dark:bg-slate-900/60 rounded-lg px-3 py-1.5 flex items-center justify-between border border-gray-200/60 dark:border-slate-700/50">
                    <div className="flex items-center gap-2 truncate max-w-[180px]">
                      <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[9px] flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-slate-100 text-xs truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500 dark:text-slate-400 font-medium">{item.quantity} Sold</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">₱{item.revenue.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Order */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-2xs border border-gray-100 dark:border-slate-700/80 space-y-2 flex-1 flex flex-col justify-between">
            <div 
              onClick={() => onSelectSale?.()}
              className="flex items-center justify-between border-b dark:border-slate-700/60 pb-2 cursor-pointer group"
              title="Click to view full Sales History"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Recent Order</h2>
              </div>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/60 px-2.5 py-0.5 rounded-full transition-colors">
                View History ({recentOrders.length}) →
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {recentOrders.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-center py-4 text-xs">No recent orders processed.</p>
              ) : (
                recentOrders.map(sale => {
                  const totalItemsCount = Array.isArray(sale.items)
                    ? sale.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
                    : 0;

                  const saleDate = sale.date ? new Date(sale.date) : new Date();
                  const formattedTime = saleDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  const badge = getPaymentBadge(sale);

                  return (
                    <div 
                      key={sale.id} 
                      onClick={() => onSelectSale?.(sale.id)}
                      className="bg-gray-50/70 dark:bg-slate-900/60 rounded-xl px-3.5 py-1.5 flex items-center justify-between border border-gray-200/60 dark:border-slate-700/50 hover:bg-emerald-50/60 dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-600 cursor-pointer transition-all active:scale-[0.99]"
                      title={`Click to view details for Order #${sale.id}`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-slate-100 text-xs">Order #{sale.id}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border shadow-2xs ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {formattedTime} • {totalItemsCount} items
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-900 dark:text-white font-bold font-mono text-xs block">
                          ₱{Number(sale.total || 0).toFixed(2)}
                        </span>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Inspect →</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Sales Overview Graph */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl p-4 text-gray-900 dark:text-white shadow-xs border border-gray-200/80 dark:border-slate-800/80 space-y-1 relative overflow-hidden flex flex-col h-full">
            {/* Header & Dropdown */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">Sales Overview</h2>
                <p className="text-[11px] text-gray-400 dark:text-slate-400 font-medium">Revenue trends & performance</p>
              </div>

              <div className="relative">
                <select
                  value={timeframe}
                  onChange={e => setTimeframe(e.target.value as any)}
                  className="bg-gray-100 hover:bg-gray-200/80 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200 text-[11px] font-semibold px-3 py-1 rounded-xl border border-gray-200 dark:border-slate-700/80 appearance-none pr-7 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
                >
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="year">This Year</option>
                </select>
                <ChevronDown className="w-3 h-3 text-gray-400 dark:text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* SVG Interactive Area Chart */}
            <div ref={chartContainerRef} className="relative w-full flex-1 flex flex-col justify-end pt-1">
              {hoveredPoint && (
                <div
                  className="absolute z-30 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-lg shadow-xl border border-slate-700/80 pointer-events-none select-none -translate-x-1/2 -translate-y-full transition-all duration-75"
                  style={{
                    left: `${hoveredPoint.x}px`,
                    top: `${hoveredPoint.y - 10}px`
                  }}
                >
                  <div className="font-bold text-sky-400 text-[10px] uppercase tracking-wider">{hoveredPoint.label}</div>
                  <div className="font-bold text-white text-xs mt-0.5">
                    ₱{hoveredPoint.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}

              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ width: "100%", height: `${svgHeight}px` }}
                className="w-full select-none block overflow-visible"
              >
                <defs>
                  {/* Gradient fill under curve */}
                  <linearGradient id="salesOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                  </linearGradient>

                  {/* Glowing dot filter */}
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Horizontal Grid lines & Y-axis labels */}
                {yTicks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={paddingLeft}
                      y1={tick.y}
                      x2={svgWidth - paddingRight}
                      y2={tick.y}
                      stroke="currentColor"
                      className="text-gray-200/80 dark:text-slate-800/80"
                      strokeWidth="1"
                      strokeDasharray={i === yTicks.length - 1 ? "none" : "3 3"}
                    />
                    <text
                      x={paddingLeft - 10}
                      y={tick.y + 3.5}
                      className="fill-gray-400 dark:fill-slate-400"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="end"
                      fontFamily="sans-serif"
                    >
                      {formatCurrencyLabel(tick.val)}
                    </text>
                  </g>
                ))}

                {/* Area Fill */}
                <path d={areaPath} fill="url(#salesOverviewGradient)" />

                {/* Main Blue Line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Points (Circular Nodes matching picture) */}
                {pointsCoords.map((pt, idx) => (
                  <g 
                    key={idx} 
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    {/* Hit area target */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="16"
                      fill="transparent"
                    />

                    {/* Visible glowing node */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredPoint?.x === pt.x ? "5.5" : "4"}
                      fill="#38bdf8"
                      className="stroke-white dark:stroke-[#0f172a] pointer-events-none transition-all duration-150"
                      strokeWidth="2"
                      filter="url(#glow)"
                    />

                    {/* X-axis labels */}
                    <text
                      x={pt.x}
                      y={svgHeight - 6}
                      className="fill-gray-400 dark:fill-slate-400 pointer-events-none"
                      fontSize="10"
                      fontWeight="500"
                      textAnchor="middle"
                      fontFamily="sans-serif"
                    >
                      {pt.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Lower Grid: Low Stock Alerts & Nearly Expired Medicines (1 1) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-2xs border border-gray-100 dark:border-slate-700/80 space-y-2">
          <div className="flex items-center justify-between border-b dark:border-slate-700/60 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight">Low Stock Alerts</h2>
            </div>
            <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-full">
              {lowStockAlerts.length} items
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {lowStockAlerts.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-center py-4 text-xs">All active stock listings restocked safely.</p>
            ) : (
              lowStockAlerts.map(item => (
                <div
                  key={item.id}
                  onClick={() => isAdminUser && onSelectProduct?.(item.name, item.id)}
                  className={`bg-gray-50/70 dark:bg-slate-900/60 rounded-lg px-3 py-1.5 flex items-center justify-between border border-gray-200/60 dark:border-slate-700/50 transition-all ${
                    isAdminUser ? "cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 dark:hover:bg-slate-900" : ""
                  }`}
                  title={isAdminUser ? "Click to view & adjust stock for this product" : undefined}
                >
                  <span className="font-semibold text-gray-900 dark:text-slate-100 text-xs truncate max-w-[200px]">{item.name}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-orange-600 dark:text-orange-400 font-bold">{item.stock} left</span>
                    <span className="text-gray-400 text-[10px]">Min: {item.minStock}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Nearly Expired Medicines */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-2xs border border-gray-100 dark:border-slate-700/80 space-y-2">
          <div className="flex items-center justify-between border-b dark:border-slate-700/60 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight">Nearly Expired Medicines</h2>
            </div>
            <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
              {nearlyExpiredProducts.length} batches
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {nearlyExpiredProducts.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-center py-4 text-xs">No batches expiring within 6 months.</p>
            ) : (
              nearlyExpiredProducts.map((b, index) => {
                const isRed = b.daysLeft <= 0;
                const isOrange = b.daysLeft > 0 && b.daysLeft <= 90;

                const badgeClass = isRed
                  ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                  : isOrange
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400"
                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-400";

                return (
                  <div
                    key={index}
                    onClick={() => isAdminUser && onSelectProduct?.(b.name)}
                    className={`bg-gray-50/70 dark:bg-slate-900/60 rounded-lg px-3 py-1.5 flex items-center justify-between border border-gray-200/60 dark:border-slate-700/50 transition-all ${
                      isAdminUser ? "cursor-pointer hover:border-red-400 hover:bg-red-50/30 dark:hover:bg-slate-900" : ""
                    }`}
                    title={isAdminUser ? "Click to view & adjust stock for this product" : undefined}
                  >
                    <span className="font-semibold text-gray-900 dark:text-slate-100 text-xs truncate max-w-[180px]">{b.name}</span>
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${badgeClass}`}>
                        {isRed ? "EXPIRED" : `${b.daysLeft}d left`}
                      </span>
                      <span className="text-gray-400 font-mono text-[10px]">{b.expiryDate}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
