export type PageId = "dashboard" | "counter" | "inventory" | "repairs" | "cash" | "reports";

export interface DashboardData {
  todayRevenue: number;
  todayProfit: number;
  monthRevenue: number;
  monthProfit: number;
  monthExpenses: number;
  activeRepairs: number;
  readyRepairs: number;
  overdueRepairs: number;
  lowStockCount: number;
  stockValue: number;
  todaySaleCount: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: number;
  summary: string;
  action: string;
  createdAt: string;
}

export interface Product {
  id: number;
  productType: "bulk" | "device";
  name: string;
  brand: string;
  model: string;
  category: string;
  sku: string;
  barcode: string;
  imei: string;
  description: string;
  stock: number;
  minimumStock: number;
  purchasePrice: number;
  salePrice: number;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  id?: number;
  productType: "bulk" | "device";
  name: string;
  brand: string;
  model: string;
  category: string;
  sku: string;
  barcode: string;
  imei: string;
  description: string;
  initialStock: number;
  minimumStock: number;
  purchasePrice: number;
  salePrice: number;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isDefault: number;
}

export interface CategoryInput {
  id?: number;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export type MovementType = "sale" | "stock_in" | "customer_return" | "adjustment";

export interface StockMovementInput {
  productId: number;
  movementType: MovementType;
  quantityDelta: number;
  unitPrice: number;
  paymentMethod?: string;
  note: string;
}

export interface MovementResult {
  saleId: number | null;
  productId: number;
  productName: string;
  stock: number;
  total: number;
}

export interface SaleItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface Sale {
  id: number;
  saleDate: string;
  total: number;
  paymentMethod: string;
  note: string;
  status: "completed" | "voided";
  itemCount: number;
  summary: string;
  items: SaleItem[];
}

export type RepairStatus =
  | "received"
  | "diagnosis"
  | "waiting_approval"
  | "waiting_part"
  | "in_progress"
  | "ready"
  | "delivered"
  | "cancelled";

export interface Repair {
  id: number;
  ticketNo: string;
  customerName: string;
  customerPhone: string;
  brand: string;
  model: string;
  imei: string;
  problem: string;
  status: RepairStatus;
  receivedAt: string;
  plannedDeliveryAt: string;
  estimatedCost: number;
  chargedAmount: number;
  depositAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepairInput extends Omit<Repair, "id" | "ticketNo" | "createdAt" | "updatedAt"> {
  id: number | undefined;
}

/** Tamire takılan parça; maliyeti kâr hesabına gider olarak girer. */
export interface RepairPart {
  id: number;
  repairId: number;
  name: string;
  cost: number;
  note: string;
  createdAt: string;
}

export interface RepairPartInput {
  repairId: number;
  name: string;
  cost: number;
  note: string;
}

/** Tamir geçmişindeki bir olay. */
export interface RepairEvent {
  id: number;
  repairId: number;
  kind: "created" | "status" | "note" | "part" | "charge";
  status: string;
  note: string;
  createdAt: string;
}

export interface RepairDetail {
  repair: Repair;
  parts: RepairPart[];
  events: RepairEvent[];
  partsCost: number;
}

export interface RepairStatusInput {
  repairId: number;
  status: RepairStatus;
  note: string;
}

export interface RepairChargeInput {
  repairId: number;
  chargedAmount: number;
  depositAmount: number;
  note: string;
}

export interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  createdAt: string;
}

export interface ExpenseInput {
  id?: number;
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
}

export interface ReportPoint {
  date: string;
  revenue: number;
  profit: number;
  expenses: number;
}

export interface ReportData {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  stockValue: number;
  saleCount: number;
  repairIncome: number;
  repairPartsCost: number;
  series: ReportPoint[];
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  categoryTotals: Array<{ name: string; quantity: number; revenue: number }>;
}

export interface Settings {
  shopName: string;
  shopPhone: string;
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  autoBackup: string;
  backupDir: string;
  confirmQuickSale: string;
}

export interface BackupResult {
  path: string;
  createdAt: string;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
