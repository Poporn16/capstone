import { useState, useEffect } from "react";
import type { Sale } from "../App";
import type { InventoryItem } from "../types";
import { downloadExcelWithAutoFit, downloadMultiSheetSalesWorkbook, type SalesExportData } from "../utils/excelUtils";
import { Search, RotateCcw, FileText, Download, User, Printer, X } from "lucide-react";
import { supabase } from "../utils/apiClient";

interface SalesHistoryProps {
  currentOperator?: { username: string; displayName: string; systemRole: string } | null;
  sales: Sale[];
  inventory?: InventoryItem[];
  onToggleRefund: (saleId: string, currentStatus: boolean) => void;
}

type DateFrame = "all" | "today" | "week" | "month" | "custom";
type StatusCondition = "all" | "completed" | "voided";
type PaymentRoute = "all" | "cash" | "other" | "gcash" | "paymaya" | "bdo" | "bpi" | "card" | "bank transfer";

const ONLINE_CHANNELS = ["gcash", "paymaya", "bdo", "bpi", "card", "bank transfer"] as const

export function SalesHistory({ currentOperator, sales, inventory = [], onToggleRefund }: SalesHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrame, setDateFrame] = useState<DateFrame>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [statusCondition, setStatusCondition] = useState<StatusCondition>("all");
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>("all");
  const [customerFilter, setCustomerFilter] = useState<"all" | "named" | "walkin" | "senior" | "pwd" | "soloparent" | "naac" | "custom">("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Sale | null>(null);
  const [showOnlineFilter, setShowOnlineFilter] = useState(false);
  const [showDiscountFilter, setShowDiscountFilter] = useState(false);

  useEffect(() => {
    const salesChannel = supabase
      .channel("realtime-sales-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => {
          window.dispatchEvent(new Event("refresh_sales_data"));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(salesChannel);
    };
  }, []);

  useEffect(() => {
    const handleSelectSaleEvent = (e: any) => {
      const saleId = e.detail?.id;
      if (saleId) {
        setSearchQuery(String(saleId));
        const matchedSale = sales.find(s => String(s.id) === String(saleId) || String(s.dbId) === String(saleId));
        if (matchedSale) {
          setSelectedInvoice(matchedSale);
        }
      }
    };

    window.addEventListener("pinv_select_sale", handleSelectSaleEvent as any);
    return () => {
      window.removeEventListener("pinv_select_sale", handleSelectSaleEvent as any);
    };
  }, [sales]);

  const getFilteredSales = () => {
    let result = [...sales];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const isSearchWalkIn = ["walk-in", "walk-in customer", "regular customer", "walkin"].includes(q);
      result = result.filter(sale => {
        if (isSearchWalkIn) {
          const cName = (sale.customerName || "").toLowerCase().trim();
          if (!cName || ["walk-in", "walk-in customer", "regular customer", "walkin"].includes(cName)) {
            return true;
          }
        }
        const matchId = sale.id.toLowerCase().includes(q) || `#${sale.id}`.toLowerCase().includes(q);
        const matchItems = sale.items.some(si => si.item.name.toLowerCase().includes(q));
        const matchOperator = (sale.processedBy || "").toLowerCase().includes(q);
        const matchCustomer = (sale.customerName || "").toLowerCase().includes(q);
        const matchDisc = (sale.discountLabel || "").toLowerCase().includes(q);
        return matchId || matchItems || matchOperator || matchCustomer || matchDisc;
      });
    }

    if (customerFilter === "named") {
      result = result.filter(sale => {
        const cName = sale.customerName || (sale.discountLabel && sale.discountLabel.includes("(") ? sale.discountLabel.split("(")[1]?.replace(")", "").trim() : "");
        if (!cName || !cName.trim()) return false;
        return !["walk-in", "walk-in customer", "regular customer", "walkin"].includes(cName.trim().toLowerCase());
      });
    } else if (customerFilter === "walkin") {
      result = result.filter(sale => {
        const cName = sale.customerName || (sale.discountLabel && sale.discountLabel.includes("(") ? sale.discountLabel.split("(")[1]?.replace(")", "").trim() : "");
        if (!cName || !cName.trim()) return true;
        return ["walk-in", "walk-in customer", "regular customer", "walkin"].includes(cName.trim().toLowerCase());
      });
    } else if (customerFilter === "senior") {
      result = result.filter(sale => (sale.discountLabel || "").toLowerCase().includes("senior"));
    } else if (customerFilter === "pwd") {
      result = result.filter(sale => (sale.discountLabel || "").toLowerCase().includes("pwd"));
    } else if (customerFilter === "soloparent") {
      result = result.filter(sale => (sale.discountLabel || "").toLowerCase().includes("solo"));
    } else if (customerFilter === "naac") {
      result = result.filter(sale => (sale.discountLabel || "").toLowerCase().includes("naac"));
    } else if (customerFilter === "custom") {
      result = result.filter(sale => (sale.discountLabel || "").toLowerCase().includes("custom"));
    }

    const now = new Date();
    if (dateFrame === "today") {
      result = result.filter(sale => new Date(sale.date).toDateString() === now.toDateString());
    } else if (dateFrame === "week") {
      // Current calendar week (Monday to Sunday)
      const day = now.getDay();
      const diffToMon = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon, 0, 0, 0, 0);
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMon + 6, 23, 59, 59, 999);
      result = result.filter(sale => {
        const d = new Date(sale.date);
        return d >= startOfWeek && d <= endOfWeek;
      });
    } else if (dateFrame === "month") {
      // Current calendar month (1st to last day)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      result = result.filter(sale => {
        const d = new Date(sale.date);
        return d >= startOfMonth && d <= endOfMonth;
      });
    } else if (dateFrame === "custom") {
      if (startDate) {
        const start = new Date(startDate + "T00:00:00");
        result = result.filter(sale => new Date(sale.date) >= start);
      }
      if (endDate) {
        const end = new Date(endDate + "T23:59:59");
        result = result.filter(sale => new Date(sale.date) <= end);
      }
    }

    if (statusCondition === "completed") {
      result = result.filter(sale => !sale.isRefunded);
    } else if (statusCondition === "voided") {
      result = result.filter(sale => sale.isRefunded);
    }

    if (paymentRoute === "cash") {
      result = result.filter(sale => sale.paymentMethod === "cash");
    } else if (paymentRoute === "other") {
      result = result.filter(sale => sale.paymentMethod !== "cash");
    } else if (ONLINE_CHANNELS.includes(paymentRoute as any)) {
      result = result.filter(sale =>
        sale.paymentMethod !== "cash" &&
        (sale.onlineChannel || "").toLowerCase() === paymentRoute.toLowerCase()
      );
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredSales = getFilteredSales();
  const activeSales = filteredSales.filter(s => !s.isRefunded);
  const matrixRevenue = activeSales.reduce((sum, s) => sum + s.total, 0);
  const activeTransactionsCount = activeSales.length;
  const averageValue = activeTransactionsCount > 0 ? matrixRevenue / activeTransactionsCount : 0;
  const numberOfTransactions = filteredSales.length;
  const refundedSales = filteredSales.filter(s => s.isRefunded);
  const totalRefundsAmount = refundedSales.reduce((sum, s) => sum + s.total, 0);
  const totalRefundsCount = refundedSales.length;
  const numberOfOnlineOrders = filteredSales.filter(s => s.paymentMethod !== "cash").length;

  const [voidConfirmSale, setVoidConfirmSale] = useState<{ id: string; isRefunded: boolean; total: number } | null>(null);

  const handleToggleAction = (saleId: string, currentStatus: boolean) => {
    onToggleRefund(saleId, currentStatus);
    setVoidConfirmSale(null);
  };

  const formatItemsSummaryTruncated = (items: Array<{ item: { name: string }; quantity: number }>): string => {
    if (!items || items.length === 0) return "No items";
    if (items.length <= 2) {
      return items.map(ci => `${ci.quantity}x ${ci.item.name}`).join(", ");
    }
    const top2 = items.slice(0, 2).map(ci => `${ci.quantity}x ${ci.item.name}`).join(", ");
    const extraTypes = items.length - 2;
    const extraCount = items.slice(2).reduce((sum, ci) => sum + ci.quantity, 0);
    return `${top2} (+${extraTypes} more ${extraTypes === 1 ? 'item' : 'items'}, ${extraCount} pcs)`;
  };

  const handleExportCSV = () => {
    if (filteredSales.length === 0) return;

    const exportData: SalesExportData[] = filteredSales.map(s => {
      const totalItemsCount = s.items.reduce((sum, ci) => sum + ci.quantity, 0);
      const dateStr = formatReceiptDate(s.date);
      const statusStr = s.isRefunded ? "Voided" : "Completed";
      const channelStr = (s.onlineChannel || "").trim();
      const payStr = s.paymentMethod === "cash" 
        ? "Cash" 
        : channelStr 
          ? (s.referenceNumber ? `Online (${channelStr} - Ref: ${s.referenceNumber})` : `Online (${channelStr})`)
          : (s.referenceNumber ? `Online (Ref: ${s.referenceNumber})` : "Online");

      const rawCustomer = s.customerName || (s.discountLabel && s.discountLabel.includes("(") ? s.discountLabel.split("(")[1]?.replace(")", "").trim() : null);
      const isWalkIn = !rawCustomer || ["walk-in", "walk-in customer", "regular customer", "walkin", "none"].includes(rawCustomer.trim().toLowerCase());
      const customerNameStr = (!isWalkIn && rawCustomer) ? rawCustomer.trim() : "Walk-in Customer";

      return {
        id: String(s.id),
        date: dateStr,
        customerName: customerNameStr,
        processedBy: s.processedBy || "Staff",
        paymentOption: payStr,
        status: statusStr,
        itemsCount: totalItemsCount,
        itemsSummaryTruncated: formatItemsSummaryTruncated(s.items),
        subtotal: Number(s.grossTotal || s.total || 0),
        discount: Number(s.discount || 0),
        vat: Number(s.vat || 0),
        grandTotal: Number(s.total || 0),
        isRefunded: !!s.isRefunded,
        lineItems: s.items.map(ci => {
          const itemObj = ci.item || {} as any;
          const qty = Number(ci.quantity) || 1;
          const resolvedUnitPrice = Number(
            itemObj.price ||
            (ci as any).unit_price ||
            (ci as any).unitPrice ||
            (ci as any).price ||
            (ci as any).item_price ||
            0
          );
          
          let linePrice = Number((qty * resolvedUnitPrice).toFixed(2));
          let finalUnitPrice = resolvedUnitPrice;

          // Fallback if price on item object was 0 but transaction total exists
          if (finalUnitPrice === 0 && Number(s.total || s.subtotal || 0) > 0 && s.items.length > 0) {
            linePrice = Number((Number(s.total || s.subtotal || 0) / s.items.length).toFixed(2));
            finalUnitPrice = Number((linePrice / qty).toFixed(2));
          }

          return {
            itemDescription: itemObj.name || (ci as any).item_name || (ci as any).name || "Product Item",
            category: itemObj.category || (ci as any).category || "General",
            quantity: qty,
            unitPrice: finalUnitPrice,
            totalLinePrice: linePrice
          };
        })
      };
    });

    downloadMultiSheetSalesWorkbook("sales_history_report", exportData);
  };

  const formatReceiptDate = (d: Date) => {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric"
    }) + ", " + new Date(d).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const isAdmin = !currentOperator || currentOperator.systemRole === "admin" || currentOperator.systemRole === "superadmin";

  const uniqueCustomerNames = Array.from(
    new Set(
      sales
        .map(s => s.customerName)
        .filter((n): n is string => Boolean(n && n.trim() && !["walk-in", "walk-in customer", "regular customer", "walkin"].includes(n.trim().toLowerCase())))
    )
  )

  return (
    <div className="space-y-6 text-xs font-medium font-sans">
      {!isAdmin && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center justify-between">
          <span>🔒 <strong>Staff Restricted View:</strong> Downloading sale history spreadsheets and voiding receipts require Administrator privileges.</span>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by customer name (e.g. Kervin), transaction ID, item, or operator..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl font-medium text-gray-800 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Named Customers Quick Filter Bar */}
        {uniqueCustomerNames.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-slate-700/60">
            <span className="block text-[9px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
              Filter By Named Customer Profile ({uniqueCustomerNames.length}):
            </span>
            <div className="flex flex-wrap gap-1">
              {uniqueCustomerNames.slice(0, 15).map(cName => (
                <button
                  key={cName}
                  type="button"
                  onClick={() => setSearchQuery(searchQuery.toLowerCase() === cName.toLowerCase() ? "" : cName)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                    searchQuery.toLowerCase() === cName.toLowerCase()
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900 hover:bg-blue-100"
                  }`}
                >
                  👤 {cName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-6 items-center pt-1 text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
          <div className="space-y-1.5">
            <span className="block text-gray-400 dark:text-gray-400">Date Frame</span>
            <div className="flex flex-wrap bg-gray-100 dark:bg-slate-900 p-0.5 rounded-lg border dark:border-slate-700 gap-0.5">
              {(["all", "today", "week", "month", "custom"] as const).map(f => (
                <button key={f} type="button" onClick={() => setDateFrame(f)} className={`px-3 py-1 rounded-md transition-all uppercase ${dateFrame === f ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-black' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}>{f}</button>
              ))}
            </div>
            {dateFrame === "custom" && (
              <div className="flex items-center gap-2 pt-1 font-sans">
                <label className="text-gray-500 dark:text-gray-400 text-[10px] font-bold">From:</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-white rounded text-xs" />
                <label className="text-gray-500 dark:text-gray-400 text-[10px] font-bold">To:</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-1 border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-white rounded text-xs" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="block text-gray-400 dark:text-gray-400">Status Condition</span>
            <div className="flex bg-gray-100 dark:bg-slate-900 p-0.5 rounded-lg border dark:border-slate-700">
              {(["all", "completed", "voided"] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatusCondition(s)} className={`px-3 py-1 rounded-md transition-all ${statusCondition === s ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs font-black' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}>{s}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-gray-400 dark:text-gray-400">Payment Route</span>
            <div className="flex flex-wrap gap-1">
              {(["all", "cash", "other"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPaymentRoute(p); setShowOnlineFilter(false); }}
                  className={`px-3 py-1 rounded-md border transition-all text-[10px] font-bold uppercase tracking-wider ${
                    paymentRoute === p
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-blue-300'
                  }`}
                >
                  {p === "other" ? "Online" : p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowOnlineFilter(v => !v)}
                className={`px-3 py-1 rounded-md border transition-all text-[10px] font-bold uppercase tracking-wider ${
                  showOnlineFilter
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:border-purple-400'
                }`}
              >
                Channels Filter ▾
              </button>
            </div>
            {showOnlineFilter && (
              <div className="flex flex-wrap gap-1 pt-1.5 animate-in fade-in duration-100">
                {ONLINE_CHANNELS.map(ch => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => { setPaymentRoute(ch as PaymentRoute); setShowOnlineFilter(false); }}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition-all ${
                      paymentRoute === ch
                        ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                        : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-900 hover:bg-purple-100'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <span className="block text-gray-400 dark:text-gray-400">Customer Profile</span>
            <div className="flex flex-wrap gap-1">
              {(["all", "named", "walkin"] as const).map(cf => (
                <button
                  key={cf}
                  type="button"
                  onClick={() => { setCustomerFilter(cf); setShowDiscountFilter(false); }}
                  className={`px-3 py-1 rounded-md border transition-all text-[10px] font-bold uppercase tracking-wider ${
                    customerFilter === cf
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-blue-300'
                  }`}
                >
                  {cf === "all" ? "All" : cf === "named" ? "Named" : "Walk-in"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowDiscountFilter(v => !v)}
                className={`px-3 py-1 rounded-md border transition-all text-[10px] font-bold uppercase tracking-wider ${
                  showDiscountFilter || ["senior", "pwd", "soloparent", "naac", "custom"].includes(customerFilter)
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:border-purple-400'
                }`}
              >
                Discount Filter ▾
              </button>
            </div>
            {showDiscountFilter && (
              <div className="flex flex-wrap gap-1 pt-1.5 animate-in fade-in duration-100">
                {[
                  { id: "senior", label: "Senior (20%)" },
                  { id: "pwd", label: "PWD (20%)" },
                  { id: "soloparent", label: "Solo Parent (10%)" },
                  { id: "naac", label: "NAAC" },
                  { id: "custom", label: "Custom" }
                ].map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { setCustomerFilter(d.id as any); setShowDiscountFilter(false); }}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition-all ${
                      customerFilter === d.id
                        ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                        : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-900 hover:bg-purple-100'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-gray-400 dark:text-gray-400 font-bold text-[9px] uppercase tracking-wider">Revenue (Active Matrix Filtered)</span>
          <h3 className="text-gray-900 dark:text-white font-bold text-lg mt-1 font-mono">₱{matrixRevenue.toFixed(2)}</h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-gray-400 dark:text-gray-400 font-bold text-[9px] uppercase tracking-wider">Active Transactions Total Count</span>
          <h3 className="text-gray-900 dark:text-white font-bold text-lg mt-1 font-mono">{activeTransactionsCount}</h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-gray-400 dark:text-gray-400 font-bold text-[9px] uppercase tracking-wider">Average Active Billing Cost Value</span>
          <h3 className="text-gray-900 dark:text-white font-bold text-lg mt-1 font-mono">₱{averageValue.toFixed(2)}</h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-gray-400 dark:text-gray-400 font-bold text-[9px] uppercase tracking-wider">No. of Transactions</span>
          <h3 className="text-gray-900 dark:text-white font-bold text-lg mt-1 font-mono">{numberOfTransactions}</h3>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-gray-400 dark:text-gray-400 font-bold text-[9px] uppercase tracking-wider">Total Refunds</span>
          <div className="mt-1 flex items-baseline justify-between">
            <h3 className="text-red-600 dark:text-red-400 font-bold text-lg font-mono">₱{totalRefundsAmount.toFixed(2)}</h3>
            <span className="text-[9px] text-gray-400 dark:text-gray-400 font-bold">({totalRefundsCount} voided)</span>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <span className="text-gray-400 dark:text-gray-400 font-bold text-[9px] uppercase tracking-wider">No. of Online Orders</span>
          <h3 className="text-purple-700 dark:text-purple-300 font-bold text-lg mt-1 font-mono">{numberOfOnlineOrders}</h3>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 dark:text-white text-sm tracking-wide flex items-center gap-2">
            Logged Invoices Explorer
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Realtime Active" />
          </h3>
          {isAdmin ? (
            <button 
              type="button" 
              onClick={handleExportCSV} 
              disabled={filteredSales.length === 0}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          ) : (
            <span className="text-[10px] text-gray-400 font-bold bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
              Export Admin-Only
            </span>
          )}
        </div>

        <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 sticky top-0 z-10 backdrop-blur-xs">
              <tr className="text-gray-500 dark:text-gray-400 font-bold">
                <th className="p-4">Transaction ID</th>
                <th className="p-4">Date & Time</th>
                <th className="p-4">Customer Name</th>
                <th className="p-4">Operator</th>
                <th className="p-4">Payment Type</th>
                <th className="p-4">Status Profile</th>
                <th className="p-4">Total Cost</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400 dark:text-gray-400 font-medium bg-white dark:bg-slate-800">
                    No order rows match the filter variables.
                  </td>
                </tr>
              ) : (
                filteredSales.map(sale => (
                  <tr key={sale.id} className={`border-b border-gray-50 dark:border-slate-700/60 last:border-0 hover:bg-gray-50/60 dark:hover:bg-slate-700/60 transition-colors items-center ${sale.isRefunded ? 'bg-red-50/20 dark:bg-red-950/20 text-gray-400 dark:text-gray-500' : 'bg-white dark:bg-slate-800'}`}>
                    <td className="p-4 font-mono font-bold text-gray-700 dark:text-slate-200">#{sale.id}</td>
                    <td className="p-4 text-gray-600 dark:text-slate-300 font-medium whitespace-nowrap">{formatReceiptDate(sale.date)}</td>
                    <td className="p-4">
                      {(() => {
                        const rawCustomer = sale.customerName || (sale.discountLabel && sale.discountLabel.includes("(") ? sale.discountLabel.split("(")[1]?.replace(")", "").trim() : null)
                        const isWalkIn = !rawCustomer || 
                          ["walk-in", "walk-in customer", "regular customer", "walkin"].includes(rawCustomer.trim().toLowerCase())

                        if (!isWalkIn && rawCustomer) {
                          return (
                            <button
                              type="button"
                              onClick={() => setSearchQuery(rawCustomer)}
                              className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors inline-flex items-center gap-1"
                              title="Click to search all orders by this customer"
                            >
                              <User className="w-3 h-3 text-blue-500" />
                              <span>{rawCustomer}</span>
                            </button>
                          )
                        }
                        return <span className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold italic">Walk-in</span>
                      })()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-gray-700 dark:text-slate-200 font-semibold uppercase text-[10px]">
                        <User className="w-3 h-3 text-gray-400 dark:text-gray-400" />
                        {sale.processedBy}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] border ${
                        sale.paymentMethod === 'cash'
                          ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                          : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                      }`}>
                        {sale.paymentMethod === 'cash'
                          ? 'CASH'
                          : sale.onlineChannel
                            ? `ONLINE / ${sale.onlineChannel.toUpperCase()}`
                            : 'ONLINE'}
                      </span>
                      {sale.referenceNumber && (
                        <span className="block text-[8px] font-mono text-gray-500 dark:text-gray-400 mt-0.5 whitespace-nowrap">
                          Ref: {sale.referenceNumber}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] ${sale.isRefunded ? 'bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/60 text-green-600 dark:text-green-300'}`}>
                        {sale.isRefunded ? "Voided" : "Completed"}
                      </span>
                    </td>
                    <td className={`p-4 font-bold font-mono ${sale.isRefunded ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                      ₱{sale.total.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          type="button" 
                          onClick={() => setSelectedInvoice(sale)}
                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="View Invoice Sheet Details"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        {isAdmin ? (
                          <button 
                            type="button" 
                            onClick={() => setVoidConfirmSale({ id: sale.id, isRefunded: !!sale.isRefunded, total: sale.total })}
                            className={`p-1 transition-colors ${sale.isRefunded ? 'text-gray-400 hover:text-green-600 dark:hover:text-green-400' : 'text-gray-400 hover:text-red-500 dark:hover:text-red-400'}`}
                            title={sale.isRefunded ? "Revert Void" : "Void Invoice"}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => alert("Admin Access Required: Only Administrators can void receipts.")}
                            className="p-1 text-gray-300 dark:text-slate-600 cursor-not-allowed"
                            title="Admin Access Required to Void"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {voidConfirmSale && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-gray-100 dark:border-slate-700 text-gray-800 dark:text-slate-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${voidConfirmSale.isRefunded ? 'bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400'}`}>
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  {voidConfirmSale.isRefunded ? "Revert Void Status?" : "Confirm Void Receipt?"}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Transaction ID #{voidConfirmSale.id}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {voidConfirmSale.isRefunded ? (
                <>Are you sure you want to restore receipt <strong>#{voidConfirmSale.id}</strong> (₱{voidConfirmSale.total.toFixed(2)}) back to completed sales?</>
              ) : (
                <>Are you sure you want to void receipt <strong>#{voidConfirmSale.id}</strong> for <strong>₱{voidConfirmSale.total.toFixed(2)}</strong>? This transaction will be marked as voided.</>
              )}
            </p>

            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setVoidConfirmSale(null)}
                className="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={() => handleToggleAction(voidConfirmSale.id, voidConfirmSale.isRefunded)}
                className={`flex-1 py-2 text-white font-bold rounded-xl text-xs transition-colors shadow-xs ${voidConfirmSale.isRefunded ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {voidConfirmSale.isRefunded ? "Revert Void" : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div 
          onClick={() => setSelectedInvoice(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-5 font-mono text-[11px] text-gray-800 dark:text-slate-100 space-y-3 shadow-2xl border dark:border-slate-700 printable-receipt max-h-[88vh] flex flex-col justify-between my-auto relative"
          >
            {/* Top Right Close Button */}
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full transition-colors z-10"
              title="Close Receipt"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center pr-6">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Malabon Pharmacy and Clinic</h3>
              <p className="text-gray-500 dark:text-gray-400 text-[10px]">Invoice Record Voucher #{selectedInvoice.id}</p>
              <p className="text-gray-400 dark:text-gray-400 text-[9px] mt-0.5">{formatReceiptDate(selectedInvoice.date)}</p>
            </div>
            
            {/* Scrollable Receipt Items List */}
            <div className="border-t border-b border-dashed border-gray-200 dark:border-slate-700 py-2.5 space-y-1.5 max-h-[32vh] overflow-y-auto pr-1">
              {selectedInvoice.items.map((ci: any, idx: number) => {
                const totalItemsInInvoice = selectedInvoice.items.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0)
                const fallbackUnitPrice = (selectedInvoice.grossTotal || selectedInvoice.total) / Math.max(1, totalItemsInInvoice)
                const itemPrice = ci.item.price > 0 ? ci.item.price : fallbackUnitPrice
                const lineTotal = itemPrice * ci.quantity

                // Cascading manufacturer lookup: batch -> batch label [Brand] -> item -> inventory product -> inventory batches
                const matchedInv = (inventory || []).find(i => 
                  String(i.id) === String(ci.item?.id) || 
                  i.name.trim().toLowerCase() === (ci.item?.name || "").trim().toLowerCase()
                )
                const rawBatchLabel = ci.batch?.batchLabel || ""
                const batchManuMatch = rawBatchLabel.match(/\[(.*?)\]$/) || rawBatchLabel.match(/::\s*(.+)$/)

                const itemManufacturer = 
                  ci.batch?.manufacturer || 
                  (batchManuMatch ? batchManuMatch[1].trim() : "") ||
                  ci.item?.manufacturer || 
                  matchedInv?.manufacturer || 
                  matchedInv?.batches?.find((b: any) => b.manufacturer)?.manufacturer || 
                  ""

                return (
                  <div key={idx} className="flex justify-between items-start text-xs border-b border-gray-100 dark:border-slate-800 pb-1 last:border-0">
                    <span className="pr-4 leading-tight">
                      {ci.quantity}x {ci.item.name}
                      {itemManufacturer ? ` (${itemManufacturer})` : ''}
                    </span>
                    <span className="font-bold whitespace-nowrap">₱{lineTotal.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1 text-gray-600 dark:text-slate-300">
              {selectedInvoice.customerName && (
                <div className="flex justify-between text-blue-800 dark:text-blue-300 font-bold border-b border-gray-100 dark:border-slate-800 pb-1">
                  <span>Customer:</span>
                  <span>{selectedInvoice.customerName}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Gross Total Base:</span><span>₱{selectedInvoice.grossTotal?.toFixed(2) || selectedInvoice.total.toFixed(2)}</span></div>
              {selectedInvoice.discount > 0 && (
                <div className="flex justify-between text-green-700 dark:text-green-400 font-bold">
                  <span>Applied Markdown ({selectedInvoice.discountLabel}):</span>
                  <span>-₱{selectedInvoice.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Net Taxable Base (VAT Ex):</span><span>₱{selectedInvoice.taxableBase?.toFixed(2) || selectedInvoice.total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Value Added Tax (12%):</span><span>₱{selectedInvoice.vat?.toFixed(2) || "0.00"}</span></div>
              <div className={`flex justify-between border-t border-dashed border-gray-200 dark:border-slate-700 pt-1 font-bold text-sm ${selectedInvoice.isRefunded ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                <span>Grand Total Cost</span>
                <span>₱{selectedInvoice.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 dark:border-slate-700 pt-2 space-y-1 bg-gray-50/50 dark:bg-slate-900/50 p-2 rounded border dark:border-slate-700 text-[10px]">
              <div className="flex justify-between"><span>Operator Token:</span><span className="uppercase font-bold text-gray-700 dark:text-gray-200">{selectedInvoice.processedBy}</span></div>
              <div className="flex justify-between"><span>Payment Mode Route:</span><span className="uppercase font-bold text-blue-700 dark:text-blue-400">
                {selectedInvoice.paymentMethod === "cash"
                  ? "CASH"
                  : selectedInvoice.onlineChannel
                    ? `ONLINE / ${selectedInvoice.onlineChannel.toUpperCase()}`
                    : "ONLINE PAYMENT"}
              </span></div>
              {selectedInvoice.paymentMethod === "other" && selectedInvoice.referenceNumber && (
                <div className="flex justify-between font-mono text-[10px]">
                  <span>Reference No:</span>
                  <span className="font-bold text-gray-900 dark:text-white">{selectedInvoice.referenceNumber}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Cash Tendered Amount:</span><span>₱{(selectedInvoice.cashReceived || selectedInvoice.total).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-blue-800 dark:text-blue-300"><span>Change Return Cash:</span><span>₱{selectedInvoice.change?.toFixed(2) || "0.00"}</span></div>
              <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-slate-700 mt-1 font-bold">
                <span>Ledger Line Status:</span>
                <span className={selectedInvoice.isRefunded ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                  {selectedInvoice.isRefunded ? 'VOIDED TRANSACTION' : 'PROCESSED TRANSACTION'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-slate-700">
              <button 
                type="button" 
                onClick={() => window.print()}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg tracking-wide shadow-xs flex items-center justify-center gap-1.5 text-xs transition-colors"
              >
                <Printer className="w-4 h-4" />
                Reprint Receipt
              </button>
              <button 
                type="button" 
                onClick={() => setSelectedInvoice(null)} 
                className="flex-1 py-2 bg-gray-900 dark:bg-slate-700 text-white hover:bg-gray-800 dark:hover:bg-slate-600 font-bold rounded-lg tracking-wide shadow-xs text-xs transition-colors"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}