# Capstone POS & Inventory Management System

A modern, full-featured Point of Sale (POS) and inventory management system built with React, TypeScript, and Supabase. Designed for retail operations including batch tracking, multi-channel sales, tax/VAT management, and real-time inventory synchronization.

## 🎯 Features

### Core POS System
- **Point of Sale Checkout** - Fast, intuitive checkout interface with barcode scanning support
- **Real-time Inventory Management** - Track stock levels with automatic low-stock alerts
- **Batch Tracking** - Manage product batches with expiry dates, costs, and pricing
- **Sales Processing** - Complete sales workflow with multiple payment methods (cash, other)
- **Tax & Discount Management** - Built-in VAT/tax calculation and flexible discount options

### Inventory Management
- **Product Categories** - Organize inventory by categories
- **Stock Adjustment** - Manual stock adjustments with audit trails
- **Manufacturer Tracking** - Track product manufacturers
- **Low Stock Alerts** - Real-time notifications for items below minimum stock levels
- **Batch Expiry Management** - Monitor and manage product batch expiration dates

### Sales & Analytics
- **Sales History** - Comprehensive sales records with filtering and search
- **Multi-Channel Support** - Track sales from different sales channels
- **Refund Management** - Process refunds and maintain transaction integrity
- **Sales Reporting** - View sales trends and performance metrics

### Admin Features
- **Admin Panel** - Administrative controls and system management
- **User Authentication** - Secure login system
- **Real-time Synchronization** - Multi-tab/multi-device inventory sync using BroadcastChannel API
- **Dashboard** - System overview and key metrics

### User Interface
- **Modern Design** - Built with Tailwind CSS and shadcn UI components
- **Responsive Layout** - Works seamlessly on desktop and tablet devices
- **Dark/Light Mode** - Toggle between dark and light themes
- **Intuitive Navigation** - Sidebar navigation with collapsible menu

## 🛠️ Tech Stack

- **Frontend Framework**: React 19.2.7 with TypeScript
- **Build Tool**: Vite 8.1.1
- **Backend**: Supabase (PostgreSQL, Authentication, Real-time)
- **Styling**: Tailwind CSS 4.3.3 with PostCSS
- **UI Components**: Radix UI, shadcn, Lucide Icons
- **Routing**: React Router v7
- **Linting**: ESLint with TypeScript support

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn package manager
- Supabase account with project setup
- Environment variables configured

## 🚀 Getting Started

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Poporn16/capstone.git
cd capstone/capstone-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file in the `capstone-app` directory:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is in use).

### Supabase Database Setup

After creating your Supabase project, open the SQL Editor and run the following script to enable Row Level Security for the app’s public tables and expose them to Supabase Realtime:

```sql
-- ============================================================
-- RLS ENABLE + OPEN "FOR ALL" POLICIES (all your public tables)
-- ============================================================

-- public.product_categories
CREATE TABLE IF NOT EXISTS public.product_categories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE
);
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on product_categories"
ON public.product_categories
FOR ALL
USING (true)
WITH CHECK (true);

-- public.inventory
CREATE TABLE IF NOT EXISTS public.inventory (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    category text DEFAULT 'unmarked category',
    barcode text NOT NULL UNIQUE,
    manufacturer text,
    min_stock integer DEFAULT 10,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on inventory"
ON public.inventory
FOR ALL
USING (true)
WITH CHECK (true);

-- public.inventory_batches
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id bigint NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    batch_label text NOT NULL,
    stock integer NOT NULL DEFAULT 0,
    cost numeric(10,2) DEFAULT 0.00,
    price numeric(10,2) DEFAULT 0.00,
    expiry_date date,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on inventory_batches"
ON public.inventory_batches
FOR ALL
USING (true)
WITH CHECK (true);

-- public.operator_profiles
CREATE TABLE IF NOT EXISTS public.operator_profiles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    password_text text NOT NULL,
    display_name text NOT NULL,
    system_role text DEFAULT 'staff'::text
        CHECK (system_role = ANY (ARRAY['staff'::text, 'admin'::text, 'superadmin'::text])),
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.operator_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on operator_profiles"
ON public.operator_profiles
FOR ALL
USING (true)
WITH CHECK (true);

-- public.system_audit_logs
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_username text NOT NULL,
    action_type text NOT NULL,
    module_target text NOT NULL,
    details_summary text NOT NULL,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on system_audit_logs"
ON public.system_audit_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- public.sales
CREATE TABLE IF NOT EXISTS public.sales (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    date timestamptz DEFAULT now(),
    gross_total numeric NOT NULL,
    subtotal numeric NOT NULL,
    discount numeric DEFAULT 0.00,
    taxable_base numeric NOT NULL,
    vat numeric DEFAULT 0.00,
    total numeric NOT NULL,
    cash_received numeric DEFAULT 0.00,
    change numeric DEFAULT 0.00,
    payment_method text DEFAULT 'cash'::text,
    discount_label text DEFAULT 'NONE'::text,
    senior_discount boolean DEFAULT false,
    processed_by text NOT NULL,
    is_refunded boolean DEFAULT false,
    online_channel text,
    customer_name varchar(255)
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on sales"
ON public.sales
FOR ALL
USING (true)
WITH CHECK (true);

-- public.sale_items
CREATE TABLE IF NOT EXISTS public.sale_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    item_id bigint NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    quantity integer NOT NULL,
    unit_price numeric DEFAULT 0
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on sale_items"
ON public.sale_items
FOR ALL
USING (true)
WITH CHECK (true);

-- public.sale_item_batches
CREATE TABLE IF NOT EXISTS public.sale_item_batches (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    item_name text NOT NULL,
    batch_label text NOT NULL,
    quantity_deducted integer NOT NULL,
    unit_price numeric NOT NULL,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.sale_item_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on sale_item_batches"
ON public.sale_item_batches
FOR ALL
USING (true)
WITH CHECK (true);

-- public.monthly_backup_archives
CREATE TABLE IF NOT EXISTS public.monthly_backup_archives (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    month_tag text UNIQUE,
    date_label text,
    created_at timestamptz DEFAULT now(),
    created_by text DEFAULT 'super admin'::text
);
ALTER TABLE public.monthly_backup_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on monthly_backup_archives"
ON public.monthly_backup_archives
FOR ALL
USING (true)
WITH CHECK (true);

-- ============================================================
-- Realtime: add all tables to the supabase_realtime publication
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.product_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.operator_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_item_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_backup_archives;
```

### Production Build

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

### Linting

Check code for linting issues:
```bash
npm run lint
```

## 📁 Project Structure

```
capstone-app/
├── src/
│   ├── components/
│   │   ├── AdminPanel.tsx          # Admin controls and system management
│   │   ├── Dashboard.tsx           # Main dashboard and overview
│   │   ├── InventoryManager.tsx    # Inventory management interface
│   │   ├── LoginScreen.tsx         # User authentication
│   │   ├── POSCheckout.tsx         # Point of sale checkout
│   │   ├── SalesHistory.tsx        # Sales records and history
│   │   ├── StockAdjustment.tsx     # Manual stock adjustments
│   │   └── apiClient.ts            # Supabase client configuration
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── styles/
│   │   └── index.css               # Global styles
│   ├── App.tsx                     # Main app component with routing
│   └── main.tsx                    # Application entry point
├── public/                         # Static assets
├── package.json                    # Dependencies and scripts
├── vite.config.ts                  # Vite configuration
├── tsconfig.json                   # TypeScript configuration
├── tailwind.config.js              # Tailwind CSS configuration
├── postcss.config.cjs              # PostCSS configuration
└── eslint.config.js                # ESLint configuration
```

## 🔄 Real-time Features

The application uses the BroadcastChannel API for real-time inventory synchronization across multiple browser tabs/windows:

- Automatic inventory updates when items are added, sold, or adjusted
- Cross-tab notifications for stock changes
- LocalStorage fallback for unsupported browsers
- Global sync events triggered on data modifications

## 🔐 Security

- Secure authentication via Supabase
- Role-based access control (Admin, User)
- Environment variable protection for sensitive credentials
- Real-time data validation and consistency checks

## 📝 License

This project is part of a Capstone assignment.

## 🤝 Contributing

For capstone development, please follow these guidelines:
- Create feature branches from `main`
- Write clear commit messages
- Test all functionality before pushing
- Update this README if adding new features

## 📧 Support

For issues or questions, please create an issue in the GitHub repository.

---

**Last Updated**: 2026-08-02
