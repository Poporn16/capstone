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

**Last Updated**: 2026-07-25
