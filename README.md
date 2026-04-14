# 🍎 MandiOS - The OS for Fruit Mandis

**MandiOS** is an offline-first ERP designed for the high-speed environment of fruit auctions. It digitizes Inward Entry, Auction/Bidding, Inventory, and Financial Ledgers.

## 📂 Project Structure

This monorepo contains:

-   **`/mobile`** (Flutter): The primary interface for field staff (Gate Keepers, Auctioneers).
    -   *Features*: Offline-first architecture (Hive), Speed Auction Numpad, Gate Entry.
-   **`/web`** (Next.js): The dashboard for the office staff (Muneem/Accountant).
    -   *Features*: Financial Ledgers, Cold Storage Map, Merchant Dashboard.
-   **`/supabase`** (Backend): PostgreSQL Schema and Edge Functions.
    -   *Features*: RLS Policies, Deduction Logic (`calculateNetPayable`).

## 🚀 Quick Start

### 1. Backend (Supabase)
Navigate to Supabase Dashboard and run the SQL from `supabase/schema.sql`.
Deploy Edge Functions:
```bash
supabase functions deploy calculate-net-payable
```

### 2. Mobile App
```bash
cd mobile
flutter pub get
flutter run
```
*Note: Includes Speed Auction, Stock View, and Sync Service.*

### 3. Web Dashboard
```bash
cd web
npm install
npm run dev
```
*Access at http://localhost:3000*

## 🔑 Key Features Implemented

1.  **Speed Auction**: Custom Numpad UI for sub-5-second bill generation.
2.  **Offline Logic**: Data saves to local Hive DB and syncs when internet restores.
3.  **Smart Inventory**: "Wastage Slider" to account for moisture loss (Shrinkage).
4.  **Visual Storage**: Grid-based map for Cold Storage rack management.
5.  **Financials**: Dual-Ledger system for Farmers (Payable) and Buyers (Receivable).

## 🛠 Tech Stack
-   **Frontend**: Flutter (Mobile), Next.js 14 (Web)
-   **UI Library**: ShadCN UI (Web), Material 3 (Mobile)
-   **Database**: PostgreSQL (Supabase)
-   **State/Cache**: Hive (Mobile), React Query pattern (Web)
