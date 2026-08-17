import { invoke } from "@tauri-apps/api/core";
import type {
  ActivityItem,
  BackupResult,
  Category,
  CategoryInput,
  DashboardData,
  Expense,
  ExpenseInput,
  MovementResult,
  Product,
  ProductInput,
  Repair,
  RepairInput,
  ReportData,
  Sale,
  Settings,
  StockMovementInput,
} from "../types";
import { isoDaysAgo, todayIso } from "../utils";

const isTauri = () => Boolean(window.__TAURI_INTERNALS__);
const now = () => new Date().toISOString();

/* ---------------------------------------------------------------------------
 * Tarayıcı önizlemesi için bellek içi taklit veri.
 * Masaüstü uygulamada bu kod hiç çalışmaz; tüm işlemler Rust/SQLite tarafına gider.
 * Davranışı bilerek gerçek arka uçla aynı tutuluyor ki önizleme yanıltmasın.
 * ------------------------------------------------------------------------- */

type MockMovement = {
  productId: number;
  movementType: string;
  quantityDelta: number;
  unitCost: number;
  unitPrice: number;
  saleId: number | null;
  createdAt: string;
};

type MockStore = {
  products: Array<Omit<Product, "stock" | "soldCount">>;
  categories: Category[];
  movements: MockMovement[];
  sales: Sale[];
  repairs: Array<Repair & { deliveredAt: string }>;
  expenses: Expense[];
  activities: ActivityItem[];
  settings: Settings;
  sequence: number;
};

const DEFAULT_CATEGORIES: Array<[string, string, string]> = [
  ["Telefon", "smartphone", "violet"],
  ["Kılıf", "shield", "cyan"],
  ["Ekran Koruyucu", "layers", "sky"],
  ["Kulaklık", "headphones", "green"],
  ["Şarj Aleti", "plug-zap", "amber"],
  ["Kablo", "cable", "orange"],
  ["Powerbank", "battery-charging", "lime"],
  ["Hoparlör", "speaker", "pink"],
  ["Aksesuar", "sparkles", "rose"],
  ["Yedek Parça", "wrench", "slate"],
];

const seedProduct = (
  id: number,
  name: string,
  category: string,
  purchasePrice: number,
  salePrice: number,
  extra: Partial<Product> = {},
): Omit<Product, "stock" | "soldCount"> => ({
  id,
  productType: "bulk",
  name,
  brand: "",
  model: "",
  category,
  sku: "",
  barcode: "",
  imei: "",
  description: "",
  minimumStock: 3,
  purchasePrice,
  salePrice,
  createdAt: now(),
  updatedAt: now(),
  ...extra,
});

const seedStore = (): MockStore => {
  const products = [
    seedProduct(1, "iPhone 15 Silikon Kılıf", "Kılıf", 9_000, 19_900),
    seedProduct(2, "Samsung A54 Kılıf", "Kılıf", 7_500, 16_900),
    seedProduct(3, "Nano Ekran Koruyucu", "Ekran Koruyucu", 4_000, 12_900),
    seedProduct(4, "Bluetooth Kulaklık TWS", "Kulaklık", 38_000, 74_900),
    seedProduct(5, "Kablolu Kulaklık 3.5mm", "Kulaklık", 6_500, 14_900),
    seedProduct(6, "20W Hızlı Şarj Adaptörü", "Şarj Aleti", 28_500, 49_900),
    seedProduct(7, "Type-C Kablo 1m", "Kablo", 11_000, 24_900),
    seedProduct(8, "Lightning Kablo 1m", "Kablo", 12_500, 27_900),
    seedProduct(9, "10000 mAh Powerbank", "Powerbank", 42_000, 89_900),
    seedProduct(10, "Bluetooth Hoparlör", "Hoparlör", 55_000, 109_900),
    seedProduct(11, "iPhone 13 128 GB", "Telefon", 1_975_000, 2_249_000, {
      productType: "device",
      brand: "Apple",
      model: "iPhone 13",
      imei: "351234567890482",
      description: "Gece yarısı, pil %87",
      minimumStock: 0,
    }),
    seedProduct(12, "Samsung A25 128 GB", "Telefon", 1_050_000, 1_249_000, {
      productType: "device",
      brand: "Samsung",
      model: "Galaxy A25",
      imei: "356789012345678",
      minimumStock: 0,
    }),
  ];

  const initialStock: Record<number, number> = {
    1: 12, 2: 8, 3: 24, 4: 6, 5: 15, 6: 18, 7: 2, 8: 9, 9: 5, 10: 3, 11: 1, 12: 1,
  };
  const movements: MockMovement[] = products.map((product) => ({
    productId: product.id,
    movementType: "initial",
    quantityDelta: initialStock[product.id] ?? 0,
    unitCost: product.purchasePrice,
    unitPrice: 0,
    saleId: null,
    createdAt: isoDaysAgo(20),
  }));

  return {
    products,
    categories: DEFAULT_CATEGORIES.map(([name, icon, color], index) => ({
      id: index + 1, name, icon, color, sortOrder: index, isDefault: 1,
    })),
    movements,
    sales: [],
    repairs: [
      {
        id: 1, ticketNo: "T-26-0001", customerName: "Mert Kaya", customerPhone: "5320000000",
        brand: "Samsung", model: "Galaxy A54", imei: "", problem: "Ekran kırık, görüntü yok",
        status: "ready", receivedAt: isoDaysAgo(2), plannedDeliveryAt: todayIso(),
        estimatedCost: 220_000, chargedAmount: 250_000, depositAmount: 0, notes: "",
        createdAt: now(), updatedAt: now(), deliveredAt: "",
      },
      {
        id: 2, ticketNo: "T-26-0002", customerName: "Elif Demir", customerPhone: "5331112233",
        brand: "Apple", model: "iPhone 11", imei: "", problem: "Şarj soketi temassızlık",
        status: "in_progress", receivedAt: isoDaysAgo(1), plannedDeliveryAt: todayIso(),
        estimatedCost: 85_000, chargedAmount: 0, depositAmount: 0, notes: "",
        createdAt: now(), updatedAt: now(), deliveredAt: "",
      },
      {
        id: 3, ticketNo: "T-26-0003", customerName: "Ahmet Yılmaz", customerPhone: "",
        brand: "Xiaomi", model: "Redmi Note 10", imei: "", problem: "Batarya hızlı tükeniyor",
        status: "waiting_approval", receivedAt: isoDaysAgo(5), plannedDeliveryAt: isoDaysAgo(1),
        estimatedCost: 120_000, chargedAmount: 0, depositAmount: 0, notes: "",
        createdAt: now(), updatedAt: now(), deliveredAt: "",
      },
    ],
    expenses: [
      { id: 1, category: "Kira", description: "Ağustos kirası", amount: 1_850_000, expenseDate: isoDaysAgo(4), paymentMethod: "transfer", createdAt: now() },
      { id: 2, category: "Sarf", description: "Lehim ve temizlik malzemesi", amount: 168_500, expenseDate: isoDaysAgo(2), paymentMethod: "cash", createdAt: now() },
    ],
    activities: [],
    settings: {
      shopName: "Dükkan", shopPhone: "", theme: "light", density: "comfortable",
      autoBackup: "1", backupDir: "", confirmQuickSale: "0",
    },
    sequence: 100,
  };
};

let mock = seedStore();
const nextId = () => (mock.sequence += 1);

const log = (summary: string, action: string) => {
  mock.activities.unshift({ id: nextId(), summary, action, createdAt: now() });
  mock.activities = mock.activities.slice(0, 40);
};

const stockOf = (productId: number) =>
  mock.movements.filter((item) => item.productId === productId).reduce((sum, item) => sum + item.quantityDelta, 0);

const soldOf = (productId: number) =>
  mock.movements
    .filter((item) => item.productId === productId && ["sale", "customer_return", "sale_void"].includes(item.movementType))
    .reduce((sum, item) => sum - item.quantityDelta, 0);

const hydrate = (product: Omit<Product, "stock" | "soldCount">): Product => ({
  ...product,
  stock: stockOf(product.id),
  soldCount: soldOf(product.id),
});

const completedSales = () => mock.sales.filter((sale) => sale.status === "completed");

const salesRevenueBetween = (start: string, end: string) =>
  completedSales()
    .filter((sale) => sale.saleDate.slice(0, 10) >= start && sale.saleDate.slice(0, 10) <= end)
    .reduce((sum, sale) => sum + sale.total, 0);

const costBetween = (start: string, end: string) =>
  completedSales()
    .filter((sale) => sale.saleDate.slice(0, 10) >= start && sale.saleDate.slice(0, 10) <= end)
    .reduce((sum, sale) => sum + sale.items.reduce((inner, item) => inner + item.quantity * item.unitCost, 0), 0);

const repairIncomeBetween = (start: string, end: string) =>
  mock.repairs
    .filter((repair) => repair.status === "delivered" && repair.deliveredAt && repair.deliveredAt.slice(0, 10) >= start && repair.deliveredAt.slice(0, 10) <= end)
    .reduce((sum, repair) => sum + repair.chargedAmount, 0);

const expensesBetween = (start: string, end: string) =>
  mock.expenses
    .filter((expense) => expense.expenseDate >= start && expense.expenseDate <= end)
    .reduce((sum, expense) => sum + expense.amount, 0);

const stockValue = () =>
  mock.products.reduce((sum, product) => sum + Math.max(0, stockOf(product.id)) * product.purchasePrice, 0);

const mockDashboard = (): DashboardData => {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = `${today.slice(0, 7)}-31`;
  const todayRevenue = salesRevenueBetween(today, today) + repairIncomeBetween(today, today);
  const monthRevenue = salesRevenueBetween(monthStart, monthEnd) + repairIncomeBetween(monthStart, monthEnd);
  const monthExpenses = expensesBetween(monthStart, monthEnd);
  return {
    todayRevenue,
    todayProfit: todayRevenue - costBetween(today, today),
    monthRevenue,
    monthProfit: monthRevenue - costBetween(monthStart, monthEnd) - monthExpenses,
    monthExpenses,
    activeRepairs: mock.repairs.filter((repair) => !["delivered", "cancelled"].includes(repair.status)).length,
    readyRepairs: mock.repairs.filter((repair) => repair.status === "ready").length,
    overdueRepairs: mock.repairs.filter(
      (repair) => repair.plannedDeliveryAt && repair.plannedDeliveryAt < today && !["delivered", "cancelled"].includes(repair.status),
    ).length,
    lowStockCount: mock.products.filter((product) => product.minimumStock > 0 && stockOf(product.id) <= product.minimumStock).length,
    stockValue: stockValue(),
    todaySaleCount: completedSales().filter((sale) => sale.saleDate.slice(0, 10) === today && sale.total > 0).length,
    recentActivity: mock.activities.slice(0, 8),
  };
};

const mockMovement = (input: StockMovementInput): MovementResult => {
  const product = mock.products.find((item) => item.id === input.productId);
  if (!product) throw new Error("Ürün bulunamadı.");
  const current = stockOf(product.id);
  if (current + input.quantityDelta < 0) throw new Error(`Yetersiz stok. Mevcut: ${current}`);

  const timestamp = now();
  let saleId: number | null = null;
  let total = 0;
  if (input.movementType === "sale" || input.movementType === "customer_return") {
    const quantity = Math.abs(input.quantityDelta);
    const sign = input.movementType === "sale" ? 1 : -1;
    total = input.unitPrice * quantity * sign;
    saleId = nextId();
    mock.sales.unshift({
      id: saleId,
      saleDate: timestamp,
      total,
      paymentMethod: input.paymentMethod || "cash",
      note: input.note,
      status: "completed",
      itemCount: quantity,
      summary: `${product.name} × ${quantity}`,
      items: [{
        productId: product.id, productName: product.name, quantity: quantity * sign,
        unitPrice: input.unitPrice, unitCost: product.purchasePrice,
      }],
    });
  }
  mock.movements.push({
    productId: product.id,
    movementType: input.movementType,
    quantityDelta: input.quantityDelta,
    unitCost: product.purchasePrice,
    unitPrice: input.unitPrice,
    saleId,
    createdAt: timestamp,
  });
  product.updatedAt = timestamp;
  const verb = input.movementType === "sale" ? "satıldı"
    : input.movementType === "stock_in" ? "stoğa eklendi"
      : input.movementType === "customer_return" ? "iade alındı" : "stok düzeltildi";
  log(`${product.name} · ${Math.abs(input.quantityDelta)} adet ${verb}`, input.movementType);

  return { saleId, productId: product.id, productName: product.name, stock: current + input.quantityDelta, total };
};

const mockVoidSale = (saleId: number) => {
  const sale = mock.sales.find((item) => item.id === saleId);
  if (!sale) throw new Error("Satış kaydı bulunamadı.");
  if (sale.status !== "completed") throw new Error("Bu işlem zaten geri alınmış.");
  for (const item of sale.items) {
    if (stockOf(item.productId) + item.quantity < 0) throw new Error("Stok yetersiz, iade geri alınamıyor.");
  }
  for (const item of sale.items) {
    mock.movements.push({
      productId: item.productId, movementType: "sale_void", quantityDelta: item.quantity,
      unitCost: item.unitCost, unitPrice: 0, saleId, createdAt: now(),
    });
  }
  sale.status = "voided";
  log(`${sale.summary} işlemi geri alındı`, "voided");
};

/* ------------------------------------------------------------------ arayüz */

export const api = {
  isDesktop: isTauri,

  dashboard: async (): Promise<DashboardData> =>
    isTauri() ? invoke<DashboardData>("get_dashboard") : mockDashboard(),

  products: async (search = ""): Promise<Product[]> => {
    if (isTauri()) return invoke<Product[]>("get_products", { search });
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    return mock.products
      .filter((product) =>
        !needle ||
        [product.name, product.brand, product.model, product.category, product.sku, product.barcode, product.imei]
          .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle)))
      .map(hydrate)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  saveProduct: async (input: ProductInput): Promise<number> => {
    if (isTauri()) return invoke<number>("upsert_product", { input });
    if (!input.name.trim()) throw new Error("Ürün adı boş bırakılamaz.");
    const category = input.category.trim() || (input.productType === "device" ? "Telefon" : "Aksesuar");
    if (input.imei.trim() && mock.products.some((item) => item.imei === input.imei.trim() && item.id !== input.id)) {
      throw new Error("Bu IMEI zaten kayıtlı.");
    }
    if (!mock.categories.some((item) => item.name === category)) {
      mock.categories.push({ id: nextId(), name: category, icon: "package", color: "slate", sortOrder: mock.categories.length, isDefault: 0 });
    }
    const timestamp = now();
    if (input.id) {
      const index = mock.products.findIndex((item) => item.id === input.id);
      if (index < 0) throw new Error("Ürün bulunamadı.");
      mock.products[index] = { ...mock.products[index], ...input, category, id: input.id, updatedAt: timestamp };
      log(`${input.name} güncellendi`, "updated");
      return input.id;
    }
    const id = nextId();
    mock.products.unshift({
      id, productType: input.productType, name: input.name.trim(), brand: input.brand, model: input.model,
      category, sku: input.sku, barcode: input.barcode, imei: input.imei, description: input.description,
      minimumStock: input.minimumStock, purchasePrice: input.purchasePrice, salePrice: input.salePrice,
      createdAt: timestamp, updatedAt: timestamp,
    });
    if (input.initialStock > 0) {
      mock.movements.push({
        productId: id, movementType: "initial", quantityDelta: input.initialStock,
        unitCost: input.purchasePrice, unitPrice: 0, saleId: null, createdAt: timestamp,
      });
    }
    log(`${input.name} eklendi`, "created");
    return id;
  },

  deleteProduct: async (id: number): Promise<void> => {
    if (isTauri()) return invoke<void>("delete_product", { id });
    const product = mock.products.find((item) => item.id === id);
    mock.products = mock.products.filter((item) => item.id !== id);
    if (product) log(`${product.name} arşivlendi`, "archived");
  },

  categories: async (): Promise<Category[]> =>
    isTauri() ? invoke<Category[]>("get_categories") : [...mock.categories].sort((a, b) => a.sortOrder - b.sortOrder),

  saveCategory: async (input: CategoryInput): Promise<number> => {
    if (isTauri()) return invoke<number>("upsert_category", { input });
    const name = input.name.trim();
    if (!name) throw new Error("Kategori adı boş bırakılamaz.");
    if (mock.categories.some((item) => item.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR") && item.id !== input.id)) {
      throw new Error("Bu isimde bir kategori zaten var.");
    }
    if (input.id) {
      const category = mock.categories.find((item) => item.id === input.id);
      if (!category) throw new Error("Kategori bulunamadı.");
      const previous = category.name;
      Object.assign(category, { name, icon: input.icon, color: input.color, sortOrder: input.sortOrder });
      mock.products.forEach((product) => { if (product.category === previous) product.category = name; });
      return input.id;
    }
    const id = nextId();
    mock.categories.push({ id, name, icon: input.icon || "package", color: input.color || "cyan", sortOrder: input.sortOrder, isDefault: 0 });
    return id;
  },

  deleteCategory: async (id: number): Promise<void> => {
    if (isTauri()) return invoke<void>("delete_category", { id });
    const category = mock.categories.find((item) => item.id === id);
    if (!category) throw new Error("Kategori bulunamadı.");
    const inUse = mock.products.filter((product) => product.category === category.name).length;
    if (inUse > 0) throw new Error(`${category.name} kategorisinde ${inUse} ürün var. Önce ürünleri başka kategoriye taşıyın.`);
    mock.categories = mock.categories.filter((item) => item.id !== id);
  },

  stockMovement: async (input: StockMovementInput): Promise<MovementResult> =>
    isTauri() ? invoke<MovementResult>("add_stock_movement", { input }) : mockMovement(input),

  quickMovement: async (productId: number, quantityDelta: number): Promise<MovementResult> => {
    if (isTauri()) return invoke<MovementResult>("quick_movement", { input: { productId, quantityDelta } });
    const product = mock.products.find((item) => item.id === productId);
    if (!product) throw new Error("Ürün bulunamadı.");
    const isSale = quantityDelta < 0;
    return mockMovement({
      productId,
      movementType: isSale ? "sale" : "stock_in",
      quantityDelta,
      unitPrice: isSale ? product.salePrice : 0,
      paymentMethod: "cash",
      note: isSale ? "Tezgah satışı" : "Tezgah stok girişi",
    });
  },

  sales: async (limit = 60): Promise<Sale[]> =>
    isTauri() ? invoke<Sale[]>("get_sales", { limit }) : mock.sales.slice(0, limit),

  voidSale: async (id: number): Promise<void> => {
    if (isTauri()) return invoke<void>("void_sale", { id });
    mockVoidSale(id);
  },

  repairs: async (): Promise<Repair[]> =>
    isTauri() ? invoke<Repair[]>("get_repairs") : mock.repairs.map(({ deliveredAt: _deliveredAt, ...repair }) => repair),

  saveRepair: async (input: RepairInput): Promise<number> => {
    if (isTauri()) return invoke<number>("upsert_repair", { input });
    const timestamp = now();
    if (input.id) {
      const repair = mock.repairs.find((item) => item.id === input.id);
      if (!repair) throw new Error("Tamir kaydı bulunamadı.");
      const deliveredAt = input.status === "delivered" ? repair.deliveredAt || timestamp : "";
      Object.assign(repair, input, { id: input.id, updatedAt: timestamp, deliveredAt });
      log(`${input.brand} ${input.model} güncellendi`, "updated");
      return input.id;
    }
    const id = nextId();
    mock.repairs.unshift({
      ...input, id, ticketNo: `T-26-${String(id).padStart(4, "0")}`,
      createdAt: timestamp, updatedAt: timestamp,
      deliveredAt: input.status === "delivered" ? timestamp : "",
    });
    log(`${input.brand} ${input.model} tamire alındı`, "created");
    return id;
  },

  deleteRepair: async (id: number): Promise<void> => {
    if (isTauri()) return invoke<void>("delete_repair", { id });
    mock.repairs = mock.repairs.filter((item) => item.id !== id);
  },

  expenses: async (): Promise<Expense[]> =>
    isTauri() ? invoke<Expense[]>("get_expenses") : [...mock.expenses],

  saveExpense: async (input: ExpenseInput): Promise<number> => {
    if (isTauri()) return invoke<number>("add_expense", { input });
    if (input.id) {
      const expense = mock.expenses.find((item) => item.id === input.id);
      if (!expense) throw new Error("Gider kaydı bulunamadı.");
      Object.assign(expense, input);
      return input.id;
    }
    const id = nextId();
    mock.expenses.unshift({ ...input, id, createdAt: now() });
    log(`${input.description} gideri eklendi`, "created");
    return id;
  },

  deleteExpense: async (id: number): Promise<void> => {
    if (isTauri()) return invoke<void>("delete_expense", { id });
    mock.expenses = mock.expenses.filter((item) => item.id !== id);
  },

  report: async (start: string, end: string): Promise<ReportData> => {
    if (isTauri()) return invoke<ReportData>("get_report", { start, end });
    if (end < start) throw new Error("Tarih aralığı geçersiz.");

    const revenue = salesRevenueBetween(start, end);
    const repairIncome = repairIncomeBetween(start, end);
    const costOfGoods = costBetween(start, end);
    const expenses = expensesBetween(start, end);
    const total = revenue + repairIncome;

    const dates: string[] = [];
    const cursor = new Date(`${start}T12:00:00`);
    const finish = new Date(`${end}T12:00:00`);
    while (cursor <= finish) {
      dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
      cursor.setDate(cursor.getDate() + 1);
    }

    const soldItems = completedSales()
      .filter((sale) => sale.saleDate.slice(0, 10) >= start && sale.saleDate.slice(0, 10) <= end)
      .flatMap((sale) => sale.items);
    const group = (key: (item: (typeof soldItems)[number]) => string) => {
      const map = new Map<string, { name: string; quantity: number; revenue: number }>();
      for (const item of soldItems) {
        const name = key(item);
        const entry = map.get(name) || { name, quantity: 0, revenue: 0 };
        entry.quantity += item.quantity;
        entry.revenue += item.quantity * item.unitPrice;
        map.set(name, entry);
      }
      return [...map.values()].filter((entry) => entry.quantity > 0).sort((a, b) => b.revenue - a.revenue);
    };

    return {
      revenue: total,
      costOfGoods,
      grossProfit: total - costOfGoods,
      expenses,
      netProfit: total - costOfGoods - expenses,
      stockValue: stockValue(),
      saleCount: completedSales().filter((sale) => sale.saleDate.slice(0, 10) >= start && sale.saleDate.slice(0, 10) <= end && sale.total > 0).length,
      repairIncome,
      series: dates.map((date) => {
        const dayRevenue = salesRevenueBetween(date, date) + repairIncomeBetween(date, date);
        const dayExpenses = expensesBetween(date, date);
        return { date, revenue: dayRevenue, expenses: dayExpenses, profit: dayRevenue - costBetween(date, date) - dayExpenses };
      }),
      topProducts: group((item) => item.productName).slice(0, 5),
      categoryTotals: group((item) => mock.products.find((product) => product.id === item.productId)?.category || "Diğer"),
    };
  },

  settings: async (): Promise<Settings> =>
    isTauri() ? invoke<Settings>("get_settings") : { ...mock.settings },

  saveSettings: async (input: Settings): Promise<Settings> => {
    if (isTauri()) return invoke<Settings>("save_settings", { input });
    mock.settings = { ...input };
    return { ...mock.settings };
  },

  backup: async (destination?: string): Promise<BackupResult> =>
    isTauri()
      ? invoke<BackupResult>("backup_database", { destination: destination || null })
      : { path: "Önizleme modunda yedek oluşturulmadı", createdAt: now() },

  /** Tüm iş verisini siler ve uygulamayı ilk kurulum hâline döndürür. */
  resetAllData: async (): Promise<BackupResult> => {
    if (isTauri()) return invoke<BackupResult>("reset_all_data");
    mock = seedStore();
    mock.products = [];
    mock.movements = [];
    mock.sales = [];
    mock.repairs = [];
    mock.expenses = [];
    mock.activities = [];
    return { path: "Önizleme modunda yedek oluşturulmadı", createdAt: now() };
  },

  restore: async (source: string): Promise<void> =>
    isTauri() ? invoke<void>("restore_database", { source }) : undefined,

  resetPreview: () => { mock = seedStore(); },
};
