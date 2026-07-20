import { useState } from "react";
import type { Sale } from "../App";
import { Search, RotateCcw, FileText, Download, User } from "lucide-react";

interface SalesHistoryProps {
  sales: Sale[];
  onToggleRefund: (saleId: string, currentStatus: boolean) => void;
}

type DateFrame = "all" | "today" | "week" | "month";
type StatusCondition = "all" | "completed" | "voided";
type PaymentRoute = "all" | "cash" | "gcash";

export function SalesHistory({ sales, onToggleRefund }: SalesHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrame, setDateFrame] = useState<DateFrame>("all");
  const [statusCondition, setStatusCondition] = useState<StatusCondition>("all");
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Sale | null>(null);

  const getFilteredSales = () => {
    let result = [...sales];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(sale => {
        const matchId = sale.id.toLowerCase().includes(q) || `#${sale.id}`.toLowerCase().includes(q);
        const matchItems = sale.items.some(si => si.item.name.toLowerCase().includes(q));
        const matchOperator = sale.processedBy?.toLowerCase().includes(q);
        return matchId || matchItems || matchOperator;
      });
    }

    const now = new Date();
    if (dateFrame === "today") {
      result = result.filter(sale => new Date(sale.date).toDateString() === now.toDateString());
    } else if (dateFrame === "week") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      result = result.filter(sale => new Date(sale.date) >= oneWeekAgo);
    } else if (dateFrame === "month") {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);
      result = result.filter(sale => new Date(sale.date) >= oneMonthAgo);
    }

    if (statusCondition === "completed") {
      result = result.filter(sale => !sale.isRefunded);
    } else if (statusCondition === "voided") {
      result = result.filter(sale => sale.isRefunded);
    }

    if (paymentRoute === "cash") {
      result = result.filter(sale => sale.paymentMethod === "cash");
    } else if (paymentRoute === "gcash") {
      result = result.filter(sale => sale.paymentMethod === "gcash");
    }

    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredSales = getFilteredSales();
  const matrixRevenue = filteredSales.filter(s => !s.isRefunded).reduce((sum, s) => sum + s.total, 0);
  const totalCount = filteredSales.length;
  const averageValue = totalCount > 0 ? matrixRevenue / totalCount : 0;

  const handleToggleAction = (saleId: string, currentStatus: boolean) => {
    const actionLabel = currentStatus ? "revert and re-activate" : "void and invalidate";
    if (!window.confirm(`Are you sure you want to ${actionLabel} transaction #${saleId}?`)) return;
    onToggleRefund(saleId, currentStatus);
  };

  const handleExportCSV = () => {
    if (filteredSales.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,Transaction ID,Date,Operator,Payment Type,Status,Total Cost\n";
    filteredSales.forEach(s => {
      const dateStr = new Date(s.date).toLocaleDateString();
      csvContent += `#${s.id},${dateStr},${s.processedBy},${s.paymentMethod.toUpperCase()},${s.isRefunded ? "Voided" : "Completed"},${s.total.toFixed(2)}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_history_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  return (
    <div className="space-y-6 text-xs font-medium">
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by transaction ID, item, or operator..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl font-medium text-gray-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-6 items-center pt-1 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
          <div className="space-y-1.5">
            <span className="block text-gray-400">Date Frame</span>
            <div className="flex bg-gray-100 p-0.5 rounded-lg border">
              {(["all", "today", "week", "month"] as const).map(f => (
                <button key={f} type="button" onClick={() => setDateFrame(f)} className={`px-3 py-1 rounded-md transition-all ${dateFrame === f ? 'bg-white text-blue-600 shadow-xs font-black' : 'text-gray-600 hover:text-gray-900'}`}>{f}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-gray-400">Status Condition</span>
            <div className="flex bg-gray-100 p-0.5 rounded-lg border">
              {(["all", "completed", "voided"] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatusCondition(s)} className={`px-3 py-1 rounded-md transition-all ${statusCondition === s ? 'bg-white text-blue-600 shadow-xs font-black' : 'text-gray-600 hover:text-gray-900'}`}>{s}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-gray-400">Payment Route</span>
            <div className="flex bg-gray-100 p-0.5 rounded-lg border">
              {(["all", "cash", "gcash"] as const).map(p => (
                <button key={p} type="button" onClick={() => setPaymentRoute(p)} className={`px-3 py-1 rounded-md transition-all ${paymentRoute === p ? 'bg-white text-blue-600 shadow-xs font-black' : 'text-gray-600 hover:text-gray-900'}`}>{p}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs">
          <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Revenue (Active Matrix Filtered)</span>
          <h3 className="text-gray-900 font-bold text-xl mt-2">₱{matrixRevenue.toFixed(2)}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs">
          <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Active Transactions Total Count</span>
          <h3 className="text-gray-900 font-bold text-xl mt-2">{totalCount}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-xs">
          <span className="text-gray-400 font-bold text-[10px] uppercase tracking-wider">Average Active Billing Cost Value</span>
          <h3 className="text-gray-900 font-bold text-xl mt-2">₱{averageValue.toFixed(2)}</h3>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm tracking-wide">Logged Invoices Explorer</h3>
          <button 
            type="button" 
            onClick={handleExportCSV} 
            disabled={filteredSales.length === 0}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-gray-500 font-bold">
                <th className="p-4">Transaction ID</th>
                <th className="p-4">Date & Time</th>
                <th className="p-4">Operator</th> {/* New Column Title */}
                <th className="p-4">Payment Type</th>
                <th className="p-4">Status Profile</th>
                <th className="p-4">Total Cost</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 font-medium bg-white">
                    No order rows match the filter variables.
                  </td>
                </tr>
              ) : (
                filteredSales.map(sale => (
                  <tr key={sale.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors items-center ${sale.isRefunded ? 'bg-red-50/20 text-gray-400' : 'bg-white'}`}>
                    <td className="p-4 font-mono font-bold text-gray-700">#{sale.id}</td>
                    <td className="p-4 text-gray-600 font-medium whitespace-nowrap">{formatReceiptDate(sale.date)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 text-gray-700 font-semibold uppercase text-[10px]">
                        <User className="w-3 h-3 text-gray-400" />
                        {sale.processedBy}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] border ${sale.paymentMethod === 'gcash' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-green-50 border-green-100 text-green-600'}`}>
                        {sale.paymentMethod.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] ${sale.isRefunded ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        {sale.isRefunded ? "Voided" : "Completed"}
                      </span>
                    </td>
                    <td className={`p-4 font-bold font-mono ${sale.isRefunded ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      ₱{sale.total.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          type="button" 
                          onClick={() => setSelectedInvoice(sale)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => handleToggleAction(sale.id, !!sale.isRefunded)}
                          className={`p-1 transition-colors ${sale.isRefunded ? 'text-gray-400 hover:text-green-600' : 'text-gray-400 hover:text-red-500'}`}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 font-mono text-[11px] text-gray-800 space-y-4 shadow-xl border">
            <div className="text-center">
              <h3 className="font-bold text-sm text-gray-900">Malabon Pharmacy and Clinic</h3>
              <p className="text-gray-500 text-[10px]">Invoice Record Voucher #{selectedInvoice.id}</p>
              <p className="text-gray-400 text-[9px] mt-0.5">{formatReceiptDate(selectedInvoice.date)}</p>
            </div>
            
            <div className="border-t border-b border-dashed py-2.5 space-y-1">
              {selectedInvoice.items.map((ci: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start">
                  <span className="pr-4">{ci.quantity}x {ci.item.name}</span>
                  <span className="font-bold whitespace-nowrap">₱{(ci.item.price * ci.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-gray-600">
              <div className="flex justify-between"><span>Gross Total Base:</span><span>₱{selectedInvoice.grossTotal?.toFixed(2) || selectedInvoice.total.toFixed(2)}</span></div>
              {selectedInvoice.discount > 0 && (
                <div className="flex justify-between text-green-700 font-bold">
                  <span>Applied Markdown ({selectedInvoice.discountLabel}):</span>
                  <span>-₱{selectedInvoice.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between"><span>Net Taxable Base (VAT Ex):</span><span>₱{selectedInvoice.taxableBase?.toFixed(2) || selectedInvoice.total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Value Added Tax (12%):</span><span>₱{selectedInvoice.vat?.toFixed(2) || "0.00"}</span></div>
              <div className={`flex justify-between border-t border-dashed pt-1 font-bold text-sm ${selectedInvoice.isRefunded ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                <span>Grand Total Cost</span>
                <span>₱{selectedInvoice.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t border-dashed pt-2 space-y-1 bg-gray-50/50 p-2 rounded border">
              <div className="flex justify-between"><span>Operator Token:</span><span className="uppercase font-bold text-gray-700">{selectedInvoice.processedBy}</span></div>
              <div className="flex justify-between"><span>Payment Mode Route:</span><span className="uppercase font-bold text-blue-700">{selectedInvoice.paymentMethod}</span></div>
              <div className="flex justify-between"><span>Cash Tendered Amount:</span><span>₱{(selectedInvoice.cashReceived || selectedInvoice.total).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-blue-800"><span>Change Return Cash:</span><span>₱{selectedInvoice.change?.toFixed(2) || "0.00"}</span></div>
              <div className="flex justify-between pt-1 border-t mt-1 font-bold">
                <span>Ledger Line Status:</span>
                <span className={selectedInvoice.isRefunded ? 'text-red-600' : 'text-green-600'}>
                  {selectedInvoice.isRefunded ? 'VOIDED TRANSACTION' : 'PROCESSED TRANSACTION'}
                </span>
              </div>
            </div>

            <button 
              type="button" 
              onClick={() => setSelectedInvoice(null)} 
              className="w-full py-2 bg-gray-900 text-white hover:bg-gray-800 font-bold rounded-lg tracking-wide shadow-xs"
            >
              Close Invoice Sheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}