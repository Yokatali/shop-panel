use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    pub today_revenue: i64,
    pub today_profit: i64,
    pub month_revenue: i64,
    pub month_profit: i64,
    pub month_expenses: i64,
    pub active_repairs: i64,
    pub ready_repairs: i64,
    pub overdue_repairs: i64,
    pub low_stock_count: i64,
    pub stock_value: i64,
    pub today_sale_count: i64,
    pub recent_activity: Vec<ActivityItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub id: i64,
    pub summary: String,
    pub action: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: i64,
    pub product_type: String,
    pub name: String,
    pub brand: String,
    pub model: String,
    pub category: String,
    pub sku: String,
    pub barcode: String,
    pub imei: String,
    pub description: String,
    pub stock: i64,
    pub minimum_stock: i64,
    pub purchase_price: i64,
    pub sale_price: i64,
    pub sold_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductInput {
    pub id: Option<i64>,
    pub product_type: String,
    pub name: String,
    #[serde(default)]
    pub brand: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub sku: String,
    #[serde(default)]
    pub barcode: String,
    #[serde(default)]
    pub imei: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub initial_stock: i64,
    #[serde(default)]
    pub minimum_stock: i64,
    pub purchase_price: i64,
    pub sale_price: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMovementInput {
    pub product_id: i64,
    pub movement_type: String,
    pub quantity_delta: i64,
    #[serde(default)]
    pub unit_price: i64,
    #[serde(default)]
    pub payment_method: String,
    #[serde(default)]
    pub note: String,
}

/// Tezgah sayfasındaki tek dokunuşluk satış/stok işlemi.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickMovementInput {
    pub product_id: i64,
    /// Satış için negatif, stok girişi için pozitif.
    pub quantity_delta: i64,
}

/// Satış sonrası ekranda gösterilen özet (geri alma için sale_id taşır).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementResult {
    pub sale_id: Option<i64>,
    pub product_id: i64,
    pub product_name: String,
    pub stock: i64,
    pub total: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sale {
    pub id: i64,
    pub sale_date: String,
    pub total: i64,
    pub payment_method: String,
    pub note: String,
    pub status: String,
    pub item_count: i64,
    pub summary: String,
    pub items: Vec<SaleItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItem {
    pub product_id: i64,
    pub product_name: String,
    pub quantity: i64,
    pub unit_price: i64,
    pub unit_cost: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub is_default: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repair {
    pub id: i64,
    pub ticket_no: String,
    pub customer_name: String,
    pub customer_phone: String,
    pub brand: String,
    pub model: String,
    pub imei: String,
    pub problem: String,
    pub status: String,
    pub received_at: String,
    pub planned_delivery_at: String,
    pub estimated_cost: i64,
    pub charged_amount: i64,
    pub deposit_amount: i64,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Tamire takılan parça. Maliyeti kâr hesabına gider olarak girer.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairPart {
    pub id: i64,
    pub repair_id: i64,
    pub name: String,
    pub cost: i64,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairPartInput {
    pub repair_id: i64,
    pub name: String,
    #[serde(default)]
    pub cost: i64,
    #[serde(default)]
    pub note: String,
}

/// Tamir geçmişindeki bir olay: durum değişikliği, not ya da parça eklenmesi.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairEvent {
    pub id: i64,
    pub repair_id: i64,
    pub kind: String,
    pub status: String,
    pub note: String,
    pub created_at: String,
}

/// Takip panelinin ihtiyaç duyduğu her şey tek çağrıda.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairDetail {
    pub repair: Repair,
    pub parts: Vec<RepairPart>,
    pub events: Vec<RepairEvent>,
    pub parts_cost: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairStatusInput {
    pub repair_id: i64,
    pub status: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairChargeInput {
    pub repair_id: i64,
    pub charged_amount: i64,
    #[serde(default)]
    pub deposit_amount: i64,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairInput {
    pub id: Option<i64>,
    #[serde(default)]
    pub customer_name: String,
    #[serde(default)]
    pub customer_phone: String,
    pub brand: String,
    pub model: String,
    #[serde(default)]
    pub imei: String,
    pub problem: String,
    pub status: String,
    pub received_at: String,
    #[serde(default)]
    pub planned_delivery_at: String,
    #[serde(default)]
    pub estimated_cost: i64,
    #[serde(default)]
    pub charged_amount: i64,
    #[serde(default)]
    pub deposit_amount: i64,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    pub id: i64,
    pub category: String,
    pub description: String,
    pub amount: i64,
    pub expense_date: String,
    pub payment_method: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenseInput {
    pub id: Option<i64>,
    pub category: String,
    pub description: String,
    pub amount: i64,
    pub expense_date: String,
    #[serde(default)]
    pub payment_method: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportData {
    pub revenue: i64,
    pub cost_of_goods: i64,
    pub gross_profit: i64,
    pub expenses: i64,
    pub net_profit: i64,
    pub stock_value: i64,
    pub sale_count: i64,
    pub repair_income: i64,
    /// Teslim edilen tamirlere takılan parçaların maliyeti (gider).
    pub repair_parts_cost: i64,
    pub series: Vec<ReportPoint>,
    pub top_products: Vec<TopProduct>,
    pub category_totals: Vec<CategoryTotal>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPoint {
    pub date: String,
    pub revenue: i64,
    pub profit: i64,
    pub expenses: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProduct {
    pub name: String,
    pub quantity: i64,
    pub revenue: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub name: String,
    pub quantity: i64,
    pub revenue: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub shop_name: String,
    #[serde(default)]
    pub shop_phone: String,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub density: String,
    #[serde(default)]
    pub auto_backup: String,
    #[serde(default)]
    pub backup_dir: String,
    #[serde(default)]
    pub confirm_quick_sale: String,
}
