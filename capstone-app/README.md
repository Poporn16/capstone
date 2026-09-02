# 🏥 Malabon Pharmacy POS & Inventory Management System

A modern, full-featured **Point of Sale (POS)**, **Inventory**, and **Batch Management System** built with **React 19**, **TypeScript**, **Tailwind CSS**, and **Supabase (PostgreSQL & Realtime)**. Specifically designed for pharmacy and retail operations with batch expiration tracking, multi-manufacturer management, printable scannable barcodes, statutory discount handling, and multi-channel sales analytics.

---

## 🎯 Key Features

### 🛒 Core POS & Checkout System
- **Wedge & Hardware Barcode Scanner Support**: Seamlessly listens for hardware barcode scanners (such as Clabel C986 and 1D/2D handheld optical scanners) globally in the background without needing to focus input fields.
- **Smart Manufacturer Chooser**: Automatically prompts a *"Choose Manufacturer"* modal only when a scanned or selected product has multiple active batches from different manufacturers; adds immediately to cart if all batches share the same manufacturer.
- **Statutory & Custom Discounts**: Automated discount engine supporting Senior Citizen (20%), PWD (20%), Solo Parent (10%), NAAC, and custom percentage discounts with VAT exemption breakdown.
- **Customer ID & Named Registry**: Automated lookup and synchronization with the `named_persons` database table for discount eligibility validation and historical audit trails.
- **Multi-Channel Payments**: Supports Cash (with automated change calculator) and Digital/Online channels (GCash, PayMaya, Bank Transfer, Card).
- **Printable Receipts**: Live thermal receipt preview with single-click browser printing.

### 🏷️ Barcode Generation & Label Printing
- **Built-in Code-128 Barcode Engine**: Zero-dependency pure TypeScript barcode generator (`barcodeGenerator.ts`) that produces crystal-clear, scannable Code-128 SVG barcode graphics.
- **Printable Label Sheets**: Built-in modal with selectable layouts (Standard A4 / 3-Column, Compact Roll, or Large Display) for physical sticker label printing.
- **Excel Barcode Font Codes**: Automatically formats barcodes as `*BARCODE*` for seamless rendering in Microsoft Excel using fonts such as *Libre Barcode 39* or *Code 39*.

### 📦 Inventory & Batch Management
- **Per-Batch Manufacturer Isolation**: Each inventory batch independently tracks its own manufacturer brand, procurement cost, retail price, stock level, and expiration date.
- **Manufacturer Brand Auto-Suggest**: Real-time auto-suggest dropdown as you type, pulling from existing inventory records and supplier lists.
- **Category Color System**: Persistent, vibrant category-coded borders and subtle background tints (`categoryColors.ts`) for instant visual distinction across the catalogue.
- **Low Stock & Expiry Alerts**: Live automated notifications for items below minimum safety levels or batches approaching expiry.

### 📊 Excel Import & Export
- **Multi-Batch Stock Template Export**: Downloads structured Excel spreadsheets containing `Product Name`, `Manufacturer Brand`, `Cost`, `Price`, `Minimum Stock`, `Stock Quantity`, and `Expiration Date`.
- **Intelligent Bulk Upload Parser**: Flexible spreadsheet importer supporting 7-column, 5-column, and legacy 4-column formats with batch cost and price retention.
- **Clean Numeric Formatting**: Numbers and stock quantities are exported cleanly without currency pollution.

### ⏱️ Staff Attendance & Time Clock
- **Time In / Time Out Modal**: Quick staff attendance clock-in/out modal accessible directly from the top header.
- **Attendance Records Table**: Dedicated attendance history log with status tracking, work duration calculation, and Excel audit export.

### 📈 Sales Analytics & Multi-Sheet Reporting
- **Multi-Sheet Sales Workbooks**: Exports transactions and line-item details into multi-tab `.xlsx` workbooks.
- **Core Sales Analytics**: Detailed breakdown of gross revenue, net taxable sales, VAT, profit margins, top-selling categories, and operator performance.

### 🛡️ Admin Panel & System Governance
- **Role-Based Access Control**: Strict permissions separating Super Admin, Admin, and Cashier/Staff operations.
- **Real-Time Cross-Tab Sync**: Multi-tab synchronization using the `BroadcastChannel` API and Supabase Realtime channels.
- **System Audit Logs**: Comprehensive activity logging for product creations, stock adjustments, price changes, and user management.

---

## 🛠️ Tech Stack

- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool & Bundler**: [Vite 8](https://vitejs.dev/)
- **Database & Realtime**: [Supabase](https://supabase.com/) (PostgreSQL + Realtime WebSockets)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Spreadsheet Processing**: [SheetJS (xlsx)](https://sheetjs.com/)
- **Typography**: [Inter Variable Font](https://fontsource.org/fonts/inter)

---

## 📁 Project Structure

```text
capstone/
├── capstone-app/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminPanel.tsx            # Admin management, audit logs, and user roles
│   │   │   ├── BarcodePrintModal.tsx     # Printable barcode sticker & Excel export modal
│   │   │   ├── Dashboard.tsx             # Overview metrics, alerts, and quick actions
│   │   │   ├── InventoryManager.tsx      # "Item specs" - Product profile & category manager
│   │   │   ├── LoginScreen.tsx           # Operator authentication & session handling
│   │   │   ├── POSCheckout.tsx           # Point of Sale interface, cart, & discount calculator
│   │   │   ├── SalesHistory.tsx          # Transaction logs, receipt re-printing, & refunding
│   │   │   ├── SalesReport.tsx           # Comprehensive sales analytics & charts
│   │   │   ├── StaffAttendanceModal.tsx  # Quick Time In / Time Out clock modal
│   │   │   ├── StaffAttendancePage.tsx   # Staff attendance log directory & Excel export
│   │   │   └── StockAdjustment.tsx       # "Inventory" - Batch stock adjustment & Excel sync
│   │   ├── types/
│   │   │   └── index.ts                  # Shared TypeScript interfaces & types
│   │   ├── utils/
│   │   │   ├── apiClient.ts              # Supabase client & global sync broadcast helper
│   │   │   ├── barcodeGenerator.ts       # Code-128 SVG & Excel font code generator
│   │   │   ├── categoryColors.ts         # Deterministic category theme & color definitions
│   │   │   └── excelUtils.ts             # Excel workbook generator & parser utilities
│   │   ├── styles/
│   │   │   └── index.css                 # Global CSS & Tailwind configuration
│   │   ├── App.tsx                       # Main shell, navigation sidebar, & theme provider
│   │   └── main.tsx                      # App entry point
│   ├── package.json                      # Project dependencies & scripts
│   ├── vite.config.ts                    # Vite configuration
│   └── tsconfig.json                     # TypeScript configuration
└── README.md                             # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm**
- A **Supabase** project instance

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Poporn16/capstone.git

# Navigate to the app directory
cd capstone/capstone-app

# Install dependencies
npm install
```

### 3. Configure Environment Variables
Create a `.env` or `.env.local` file inside `capstone-app`:
```env
VITE_SUPABASE_URL=https://your-supabase-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run Locally
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for Production
```bash
npm run build
```

---

## 🗄️ Database Setup (Supabase SQL)

Run the following script in your Supabase SQL Editor to set up the necessary tables, relationships, and Realtime publications:

```sql
-- Product Categories
CREATE TABLE IF NOT EXISTS public.product_categories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE
);

-- Main Inventory Profiles
CREATE TABLE IF NOT EXISTS public.inventory (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL,
    price numeric(10,2) NOT NULL DEFAULT 0.00,
    cost numeric(10,2) NOT NULL DEFAULT 0.00,
    stock integer NOT NULL DEFAULT 0,
    min_stock integer NOT NULL DEFAULT 0,
    barcode text,
    manufacturer text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Product Batch Assignments (with Encoded Manufacturer)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id bigint REFERENCES public.inventory(id) ON DELETE CASCADE,
    batch_label text NOT NULL,
    stock integer NOT NULL DEFAULT 0,
    cost numeric(10,2) NOT NULL DEFAULT 0.00,
    price numeric(10,2) NOT NULL DEFAULT 0.00,
    expiry_date date,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Named Persons Registry for Discounts
CREATE TABLE IF NOT EXISTS public.named_persons (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_number text NOT NULL UNIQUE,
    name text NOT NULL,
    discount_type text NOT NULL DEFAULT 'none',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sales Transactions
CREATE TABLE IF NOT EXISTS public.sales (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gross_total numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    discount numeric(10,2) NOT NULL DEFAULT 0.00,
    vat numeric(10,2) NOT NULL DEFAULT 0.00,
    total numeric(10,2) NOT NULL,
    cash_received numeric(10,2) NOT NULL,
    change numeric(10,2) NOT NULL DEFAULT 0.00,
    payment_method text NOT NULL,
    online_channel text,
    discount_label text,
    customer_name text,
    operator_name text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sales Line Items
CREATE TABLE IF NOT EXISTS public.sales_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id bigint REFERENCES public.sales(id) ON DELETE CASCADE,
    item_id bigint REFERENCES public.inventory(id),
    product_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    batch_label text
);

-- Staff Attendance Logs
CREATE TABLE IF NOT EXISTS public.staff_attendance (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL,
    display_name text NOT NULL,
    action_type text NOT NULL, -- 'time_in' or 'time_out'
    notes text,
    timestamp timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- System Audit Logs
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_username text NOT NULL,
    action_type text NOT NULL,
    module_target text NOT NULL,
    details_summary text NOT NULL,
    timestamp timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.named_persons;
```

---

## 🎨 Theme & Palette Reference

- **Light Mode Canvas**: `#ECE6DD`
- **Sidebar Background**: `#89A1A0`
- **Active Navigation Pill**: `#FFFFFF` with soft shadow & slate text
- **Dark Mode**: Slate-900 / Slate-800 contrast mode

---

## 👨‍💻 Author & Attribution

- **Developer & System Architect**: **Vin** ([@Poporn16](https://github.com/Poporn16))
- **Project**: Malabon Pharmacy & Clinic POS & Inventory Management System
- **Academic Context**: Undergraduate Capstone Project
- **Repository**: [https://github.com/Poporn16/capstone](https://github.com/Poporn16/capstone)
- **Copyright**: © 2026 Vin ([Poporn16](https://github.com/Poporn16)). All rights reserved.

<!-- 
=================================================================================
  AUTH_WATERMARK: PROOF OF AUTHORSHIP & ORIGINAL WORK
  Author: Vin (GitHub: Poporn16)
  Project: Malabon Pharmacy & Clinic Point of Sale & Inventory System
  Repository: https://github.com/Poporn16/capstone
  Digital ID: VIN-POPORN16-CAPSTONE-MALABON-PHARMACY-2026
  Signature Hash: 76696e2d706f706f726e31362d63617073746f6e652d6d616c61626f6e
=================================================================================
-->

