/**
 * Navigation Types — Typed route params for every navigator.
 * UPDATED: Added exact 1:1 mapping of web navigation menus.
 */

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  OtpVerify: { email: string };
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Sales: undefined;
  Purchase: undefined;
  Inventory: undefined;
  Finance: undefined;
  More: undefined;
};

export type SalesStackParamList = {
  SalesHub: undefined;
  SalesList: undefined;
  SaleDetail: { id: string };
  SaleCreate: undefined;
  Pos: undefined;
  Returns: undefined;
  // New web-parity screens
  BulkLotSale: undefined;
  QuotationsList: undefined;
  QuotationCreate: undefined;
  SalesOrdersList: undefined;
  SalesOrderCreate: undefined;
  DeliveryChallansList: undefined;
  DeliveryChallanCreate: undefined;
  CreditNotesList: undefined;
  CreditNoteCreate: { type?: 'Credit Note' | 'Debit Note' } | undefined;
  // Sales-stack proxies for arrival creation
  ArrivalCreate: undefined;
  ArrivalDetail: { id: string };
};

export type PurchaseStackParamList = {
  PurchaseHub: undefined;
  GateEntryList: undefined;
  GateEntryCreate: undefined;
  ArrivalsList: undefined;
  ArrivalDetail: { id: string };
  ArrivalCreate: undefined;
  PurchaseList: undefined;
  PurchaseDetail: { id: string };
  PurchaseCreate: undefined;
  SupplierPayments: { title?: string } | undefined; // Missing parity line
  DayBook: { title?: string } | undefined; // Requested everywhere
};

export type FinanceStackParamList = {
  FinanceHub: undefined;
  DayBook: { title?: string } | undefined;
  Ledger: { contactId?: string; title?: string } | undefined;
  Receipts: { title?: string } | undefined;
  Payments: { title?: string } | undefined;
  ChequeMgmt: { title?: string } | undefined;
  GstCompliance: { title?: string } | undefined;
  BalanceSheet: { title?: string } | undefined;
};

export type InventoryStackParamList = {
  InventoryHub: undefined;
  LotsList: undefined;
  LotDetail: { id: string };
  CommoditiesList: undefined;
  CommodityDetail: { id: string };
  StockQuickEntry: undefined;
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  // Finance
  FinanceOverview: undefined;
  Ledger: { contactId?: string };
  Receipts: undefined;
  Payments: undefined;
  DayBook: undefined;
  ChequeMgmt: undefined;
  GstCompliance: undefined;
  BalanceSheet: undefined;
  TradingPl: undefined;
  Reports: undefined;
  // New: web-parity finance + reports screens
  FarmerSettlements: undefined;
  PattiNew: { farmerId: string };
  Reminders: undefined;
  ReportMargins: undefined;
  ReportStock: undefined;
  ReportPriceForecast: undefined;
  // Master Data
  Contacts: undefined;
  ContactDetail: { id: string };
  ContactCreate: undefined;
  Banks: undefined;
  Employees: undefined;
  TeamAccess: undefined;
  // Settings
  SettingsGeneral: undefined;
  FieldsGovernance: undefined;
  BankDetails: undefined;
  Branding: undefined;
  SubscriptionBilling: undefined;
  Compliance: undefined;
  // User
  Profile: undefined;
  Placeholder: { title: string; subtitle?: string };
};
