use crate::error::{AppError, AppResult};
use crate::models::*;
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct AppState {
    pub connection: Mutex<Connection>,
    pub data_dir: PathBuf,
}

/// Stoktan düşen/ekleyen ve satış sayısını etkileyen hareket türleri.
/// `sale_void` bir satışın geri alınmasıdır: stoğu geri verir, satılan adedi düşürür.
const SOLD_COUNT_EXPRESSION: &str = "COALESCE(SUM(CASE WHEN sm.movement_type IN ('sale','customer_return','sale_void') THEN -sm.quantity_delta ELSE 0 END), 0)";

const DEFAULT_CATEGORIES: &[(&str, &str, &str)] = &[
    ("Telefon", "smartphone", "violet"),
    ("Kılıf", "shield", "cyan"),
    ("Ekran Koruyucu", "layers", "sky"),
    ("Kulaklık", "headphones", "green"),
    ("Şarj Aleti", "plug-zap", "amber"),
    ("Kablo", "cable", "orange"),
    ("Powerbank", "battery-charging", "lime"),
    ("Hoparlör", "speaker", "pink"),
    ("Aksesuar", "sparkles", "rose"),
    ("Yedek Parça", "wrench", "slate"),
];

pub fn open_database(data_dir: &Path) -> AppResult<Connection> {
    fs::create_dir_all(data_dir)?;
    let db_path = data_dir.join("dukkan.sqlite");
    let connection = Connection::open(db_path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "synchronous", "FULL")?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    migrate(&connection)?;
    Ok(connection)
}

/// Şema sürümü `PRAGMA user_version` ile takip edilir; mevcut veritabanları
/// veri kaybı olmadan yeni sürüme yükseltilir.
fn migrate(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_type TEXT NOT NULL CHECK(product_type IN ('bulk', 'device')),
          name TEXT NOT NULL,
          brand TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          sku TEXT NOT NULL DEFAULT '',
          barcode TEXT NOT NULL DEFAULT '',
          imei TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          minimum_stock INTEGER NOT NULL DEFAULT 0 CHECK(minimum_stock >= 0),
          purchase_price INTEGER NOT NULL DEFAULT 0 CHECK(purchase_price >= 0),
          sale_price INTEGER NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_products_imei
          ON products(imei) WHERE imei <> '' AND archived_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_products_search
          ON products(name, brand, model, barcode, sku);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_date TEXT NOT NULL,
          subtotal INTEGER NOT NULL DEFAULT 0,
          discount INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'completed',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date DESC);

        CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL REFERENCES sales(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER NOT NULL,
          unit_price INTEGER NOT NULL,
          unit_cost INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id),
          movement_type TEXT NOT NULL,
          quantity_delta INTEGER NOT NULL CHECK(quantity_delta <> 0),
          unit_cost INTEGER NOT NULL DEFAULT 0,
          unit_price INTEGER NOT NULL DEFAULT 0,
          reference_type TEXT NOT NULL DEFAULT '',
          reference_id INTEGER,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product
          ON stock_movements(product_id, created_at);

        CREATE TABLE IF NOT EXISTS repairs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_no TEXT NOT NULL UNIQUE,
          customer_name TEXT NOT NULL DEFAULT '',
          customer_phone TEXT NOT NULL DEFAULT '',
          brand TEXT NOT NULL,
          model TEXT NOT NULL,
          imei TEXT NOT NULL DEFAULT '',
          problem TEXT NOT NULL,
          status TEXT NOT NULL,
          received_at TEXT NOT NULL,
          planned_delivery_at TEXT NOT NULL DEFAULT '',
          estimated_cost INTEGER NOT NULL DEFAULT 0,
          charged_amount INTEGER NOT NULL DEFAULT 0,
          deposit_amount INTEGER NOT NULL DEFAULT 0,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_repairs_status_date
          ON repairs(status, planned_delivery_at);

        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          amount INTEGER NOT NULL CHECK(amount > 0),
          expense_date TEXT NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          created_at TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          summary TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          icon TEXT NOT NULL DEFAULT 'package',
          color TEXT NOT NULL DEFAULT 'cyan',
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        "#,
    )?;

    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    // v1 -> v2: tamir teslim tarihi (ciroya girmesi için) ve varsayılan kategoriler.
    if version < 2 {
        let has_delivered_at = connection
            .prepare("SELECT 1 FROM pragma_table_info('repairs') WHERE name = 'delivered_at'")?
            .exists([])?;
        if !has_delivered_at {
            connection.execute("ALTER TABLE repairs ADD COLUMN delivered_at TEXT", [])?;
            // Zaten teslim edilmiş kayıtlara son güncelleme tarihini yaz.
            connection.execute(
                "UPDATE repairs SET delivered_at = updated_at WHERE status = 'delivered' AND delivered_at IS NULL",
                [],
            )?;
        }
        seed_categories(connection)?;
        connection.pragma_update(None, "user_version", 2)?;
    }

    // v2 -> v3: tamir takibi. Durum geçmişi ve takılan parçalar ayrı tutulur,
    // böylece durum güncellemek için tüm kaydı düzenlemek gerekmez.
    if version < 3 {
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS repair_parts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              repair_id INTEGER NOT NULL REFERENCES repairs(id),
              name TEXT NOT NULL,
              cost INTEGER NOT NULL DEFAULT 0 CHECK(cost >= 0),
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_repair_parts_repair ON repair_parts(repair_id);

            CREATE TABLE IF NOT EXISTS repair_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              repair_id INTEGER NOT NULL REFERENCES repairs(id),
              kind TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_repair_events_repair ON repair_events(repair_id, id);
            "#,
        )?;
        // Mevcut kayıtlar için başlangıç olayı üret ki geçmiş boş görünmesin.
        connection.execute(
            r#"INSERT INTO repair_events(repair_id, kind, status, note, created_at)
               SELECT id, 'created', status, 'Kayıt oluşturuldu', created_at FROM repairs
               WHERE NOT EXISTS (SELECT 1 FROM repair_events WHERE repair_id = repairs.id)"#,
            [],
        )?;
        connection.pragma_update(None, "user_version", 3)?;
    }

    // Eski kurulumlarda kullanılan tabloyu temizle.
    connection.execute_batch("DROP TABLE IF EXISTS schema_meta;")?;
    Ok(())
}

fn seed_categories(connection: &Connection) -> AppResult<()> {
    for (index, (name, icon, color)) in DEFAULT_CATEGORIES.iter().enumerate() {
        connection.execute(
            "INSERT OR IGNORE INTO categories(name, icon, color, sort_order, is_default) VALUES(?1, ?2, ?3, ?4, 1)",
            params![name, icon, color, index as i64],
        )?;
    }
    // Üründe olup listede olmayan kategorileri de ekle ki hiçbir ürün kaybolmasın.
    let mut statement = connection.prepare(
        "SELECT DISTINCT category FROM products WHERE archived_at IS NULL AND TRIM(category) <> ''",
    )?;
    let existing: Vec<String> = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for (index, name) in existing.iter().enumerate() {
        connection.execute(
            "INSERT OR IGNORE INTO categories(name, icon, color, sort_order, is_default) VALUES(?1, 'package', 'slate', ?2, 0)",
            params![name.trim(), (DEFAULT_CATEGORIES.len() + index) as i64],
        )?;
    }
    Ok(())
}

fn now() -> String {
    Local::now().to_rfc3339()
}

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn audit(tx: &Transaction<'_>, entity_type: &str, entity_id: i64, action: &str, summary: &str) -> AppResult<()> {
    tx.execute(
        "INSERT INTO audit_log(entity_type, entity_id, action, summary, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity_type, entity_id, action, summary, now()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- categories

pub fn list_categories(connection: &Connection) -> AppResult<Vec<Category>> {
    let mut statement = connection.prepare(
        "SELECT id, name, icon, color, sort_order, is_default FROM categories
         WHERE archived_at IS NULL ORDER BY sort_order, name",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            icon: row.get(2)?,
            color: row.get(3)?,
            sort_order: row.get(4)?,
            is_default: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn save_category(connection: &mut Connection, input: CategoryInput) -> AppResult<i64> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation("Kategori adı boş bırakılamaz.".into()));
    }
    let icon = if input.icon.trim().is_empty() { "package".to_string() } else { input.icon.trim().to_string() };
    let color = if input.color.trim().is_empty() { "cyan".to_string() } else { input.color.trim().to_string() };

    let tx = connection.transaction()?;
    let duplicate: Option<i64> = tx
        .query_row(
            "SELECT id FROM categories WHERE lower(name) = lower(?1) AND archived_at IS NULL AND id IS NOT ?2",
            params![name, input.id],
            |row| row.get(0),
        )
        .optional()?;
    if duplicate.is_some() {
        return Err(AppError::Validation("Bu isimde bir kategori zaten var.".into()));
    }

    let id = if let Some(id) = input.id {
        let previous: String = tx.query_row("SELECT name FROM categories WHERE id = ?1", [id], |row| row.get(0))?;
        tx.execute(
            "UPDATE categories SET name=?1, icon=?2, color=?3, sort_order=?4 WHERE id=?5",
            params![name, icon, color, input.sort_order, id],
        )?;
        if previous != name {
            // Kategori adı değişince ürünler de taşınsın, hiçbir ürün kategorisiz kalmasın.
            tx.execute("UPDATE products SET category=?1 WHERE category=?2", params![name, previous])?;
        }
        audit(&tx, "category", id, "updated", &format!("{} kategorisi güncellendi", name))?;
        id
    } else {
        tx.execute(
            "INSERT INTO categories(name, icon, color, sort_order, is_default) VALUES(?1, ?2, ?3, ?4, 0)",
            params![name, icon, color, input.sort_order],
        )?;
        let id = tx.last_insert_rowid();
        audit(&tx, "category", id, "created", &format!("{} kategorisi eklendi", name))?;
        id
    };
    tx.commit()?;
    Ok(id)
}

pub fn archive_category(connection: &mut Connection, id: i64) -> AppResult<()> {
    let tx = connection.transaction()?;
    let name: Option<String> = tx
        .query_row("SELECT name FROM categories WHERE id=?1 AND archived_at IS NULL", [id], |row| row.get(0))
        .optional()?;
    let name = name.ok_or_else(|| AppError::Validation("Kategori bulunamadı.".into()))?;
    let in_use: i64 = tx.query_row(
        "SELECT COUNT(*) FROM products WHERE archived_at IS NULL AND category = ?1",
        [&name],
        |row| row.get(0),
    )?;
    if in_use > 0 {
        return Err(AppError::Validation(format!(
            "{} kategorisinde {} ürün var. Önce ürünleri başka kategoriye taşıyın.",
            name, in_use
        )));
    }
    tx.execute("UPDATE categories SET archived_at=?1 WHERE id=?2", params![now(), id])?;
    audit(&tx, "category", id, "archived", &format!("{} kategorisi kaldırıldı", name))?;
    tx.commit()?;
    Ok(())
}

// ------------------------------------------------------------------ products

pub fn list_products(connection: &Connection, search: &str) -> AppResult<Vec<Product>> {
    let pattern = format!("%{}%", search.trim());
    let query = format!(
        r#"
        SELECT p.id, p.product_type, p.name, p.brand, p.model, p.category, p.sku,
               p.barcode, p.imei, p.description,
               COALESCE(SUM(sm.quantity_delta), 0) AS stock,
               p.minimum_stock, p.purchase_price, p.sale_price,
               {sold} AS sold_count,
               p.created_at, p.updated_at
        FROM products p
        LEFT JOIN stock_movements sm ON sm.product_id = p.id
        WHERE p.archived_at IS NULL
          AND (?1 = '%%' OR p.name LIKE ?1 OR p.brand LIKE ?1 OR p.model LIKE ?1
               OR p.category LIKE ?1 OR p.sku LIKE ?1 OR p.barcode LIKE ?1 OR p.imei LIKE ?1)
        GROUP BY p.id
        ORDER BY p.updated_at DESC
        "#,
        sold = SOLD_COUNT_EXPRESSION
    );
    let mut statement = connection.prepare(&query)?;
    let rows = statement.query_map([pattern], |row| {
        Ok(Product {
            id: row.get(0)?, product_type: row.get(1)?, name: row.get(2)?, brand: row.get(3)?,
            model: row.get(4)?, category: row.get(5)?, sku: row.get(6)?, barcode: row.get(7)?,
            imei: row.get(8)?, description: row.get(9)?, stock: row.get(10)?, minimum_stock: row.get(11)?,
            purchase_price: row.get(12)?, sale_price: row.get(13)?, sold_count: row.get(14)?,
            created_at: row.get(15)?, updated_at: row.get(16)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn save_product(connection: &mut Connection, input: ProductInput) -> AppResult<i64> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("Ürün adı boş bırakılamaz.".into()));
    }
    if input.purchase_price < 0 || input.sale_price < 0 || input.minimum_stock < 0 || input.initial_stock < 0 {
        return Err(AppError::Validation("Stok ve tutar alanları negatif olamaz.".into()));
    }
    if input.product_type != "bulk" && input.product_type != "device" {
        return Err(AppError::Validation("Geçersiz ürün türü.".into()));
    }
    if input.product_type == "device" && input.initial_stock > 1 {
        return Err(AppError::Validation("Tekil telefonun stoğu en fazla 1 olabilir.".into()));
    }

    let category = if input.category.trim().is_empty() {
        if input.product_type == "device" { "Telefon".to_string() } else { "Aksesuar".to_string() }
    } else {
        input.category.trim().to_string()
    };

    let tx = connection.transaction()?;

    if !input.imei.trim().is_empty() {
        let clash: Option<i64> = tx
            .query_row(
                "SELECT id FROM products WHERE imei = ?1 AND archived_at IS NULL AND id IS NOT ?2",
                params![input.imei.trim(), input.id],
                |row| row.get(0),
            )
            .optional()?;
        if clash.is_some() {
            return Err(AppError::Validation("Bu IMEI zaten kayıtlı.".into()));
        }
    }

    // Kategori listede yoksa otomatik oluştur; ürün asla kategorisiz kalmasın.
    tx.execute(
        "INSERT OR IGNORE INTO categories(name, icon, color, sort_order, is_default)
         VALUES(?1, 'package', 'slate', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), 0)",
        params![category],
    )?;

    let timestamp = now();
    let id = if let Some(id) = input.id {
        let changed = tx.execute(
            r#"UPDATE products SET product_type=?1, name=?2, brand=?3, model=?4, category=?5,
               sku=?6, barcode=?7, imei=?8, description=?9, minimum_stock=?10,
               purchase_price=?11, sale_price=?12, updated_at=?13
               WHERE id=?14 AND archived_at IS NULL"#,
            params![input.product_type, input.name.trim(), input.brand.trim(), input.model.trim(),
                category, input.sku.trim(), input.barcode.trim(), input.imei.trim(),
                input.description.trim(), input.minimum_stock, input.purchase_price, input.sale_price,
                timestamp, id],
        )?;
        if changed == 0 { return Err(AppError::Validation("Ürün bulunamadı.".into())); }
        audit(&tx, "product", id, "updated", &format!("{} güncellendi", input.name.trim()))?;
        id
    } else {
        tx.execute(
            r#"INSERT INTO products(product_type,name,brand,model,category,sku,barcode,imei,description,
               minimum_stock,purchase_price,sale_price,created_at,updated_at)
               VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)"#,
            params![input.product_type, input.name.trim(), input.brand.trim(), input.model.trim(),
                category, input.sku.trim(), input.barcode.trim(), input.imei.trim(),
                input.description.trim(), input.minimum_stock, input.purchase_price, input.sale_price, timestamp],
        )?;
        let id = tx.last_insert_rowid();
        if input.initial_stock > 0 {
            tx.execute(
                "INSERT INTO stock_movements(product_id,movement_type,quantity_delta,unit_cost,note,created_at) VALUES(?1,'initial',?2,?3,'İlk stok',?4)",
                params![id, input.initial_stock, input.purchase_price, timestamp],
            )?;
        }
        audit(&tx, "product", id, "created", &format!("{} eklendi", input.name.trim()))?;
        id
    };
    tx.commit()?;
    Ok(id)
}

pub fn archive_product(connection: &mut Connection, id: i64) -> AppResult<()> {
    let tx = connection.transaction()?;
    let name: Option<String> = tx.query_row(
        "SELECT name FROM products WHERE id=?1 AND archived_at IS NULL", [id], |row| row.get(0),
    ).optional()?;
    let name = name.ok_or_else(|| AppError::Validation("Ürün bulunamadı.".into()))?;
    tx.execute("UPDATE products SET archived_at=?1, updated_at=?1 WHERE id=?2", params![now(), id])?;
    audit(&tx, "product", id, "archived", &format!("{} arşivlendi", name))?;
    tx.commit()?;
    Ok(())
}

// ------------------------------------------------------------ stock and sales

pub fn record_stock_movement(connection: &mut Connection, input: StockMovementInput) -> AppResult<MovementResult> {
    if input.quantity_delta == 0 {
        return Err(AppError::Validation("Adet sıfır olamaz.".into()));
    }
    if input.unit_price < 0 {
        return Err(AppError::Validation("Birim fiyat negatif olamaz.".into()));
    }
    // Makul üst sınır: 1 milyar TL birim fiyat, 1 milyon adet.
    if input.unit_price > 100_000_000_000 {
        return Err(AppError::Validation("Birim fiyat çok yüksek.".into()));
    }
    if input.quantity_delta.abs() > 1_000_000 {
        return Err(AppError::Validation("Adet çok yüksek.".into()));
    }
    let allowed = ["sale", "stock_in", "customer_return", "adjustment"];
    if !allowed.contains(&input.movement_type.as_str()) {
        return Err(AppError::Validation("Geçersiz stok hareketi.".into()));
    }

    let tx = connection.transaction()?;
    let product: Option<(String, i64, i64)> = tx.query_row(
        r#"SELECT p.name, p.purchase_price, COALESCE(SUM(sm.quantity_delta),0)
           FROM products p LEFT JOIN stock_movements sm ON sm.product_id=p.id
           WHERE p.id=?1 AND p.archived_at IS NULL GROUP BY p.id"#,
        [input.product_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional()?;
    let (name, unit_cost, current_stock) = product.ok_or_else(|| AppError::Validation("Ürün bulunamadı.".into()))?;
    if current_stock + input.quantity_delta < 0 {
        return Err(AppError::Validation(format!("Yetersiz stok. Mevcut: {}", current_stock)));
    }

    let timestamp = now();
    let payment_method = if input.payment_method.trim().is_empty() { "cash" } else { input.payment_method.trim() };
    let mut reference_type = String::new();
    let mut reference_id: Option<i64> = None;
    let mut total = 0;

    if input.movement_type == "sale" || input.movement_type == "customer_return" {
        let quantity = input.quantity_delta.abs();
        let sign = if input.movement_type == "sale" { 1 } else { -1 };
        // Taşma olursa sessizce yanlış tutar yazmak yerine işlemi reddet.
        total = input
            .unit_price
            .checked_mul(quantity)
            .and_then(|ara| ara.checked_mul(sign))
            .ok_or_else(|| AppError::Validation("Tutar hesaplanamayacak kadar büyük.".into()))?;
        tx.execute(
            "INSERT INTO sales(sale_date,subtotal,total,payment_method,note,status,created_at) VALUES(?1,?2,?2,?3,?4,'completed',?1)",
            params![timestamp, total, payment_method, input.note.trim()],
        )?;
        let sale_id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,unit_cost) VALUES(?1,?2,?3,?4,?5)",
            params![sale_id, input.product_id, quantity * sign, input.unit_price, unit_cost],
        )?;
        reference_type = "sale".into();
        reference_id = Some(sale_id);
    }

    tx.execute(
        r#"INSERT INTO stock_movements(product_id,movement_type,quantity_delta,unit_cost,unit_price,
           reference_type,reference_id,note,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)"#,
        params![input.product_id, input.movement_type, input.quantity_delta, unit_cost,
            input.unit_price, reference_type, reference_id, input.note.trim(), timestamp],
    )?;
    let verb = match input.movement_type.as_str() {
        "sale" => "satıldı",
        "stock_in" => "stoğa eklendi",
        "customer_return" => "iade alındı",
        _ => "stok düzeltildi",
    };
    audit(&tx, "stock", input.product_id, &input.movement_type,
        &format!("{} · {} adet {}", name, input.quantity_delta.abs(), verb))?;
    tx.execute("UPDATE products SET updated_at=?1 WHERE id=?2", params![timestamp, input.product_id])?;
    tx.commit()?;

    Ok(MovementResult {
        sale_id: reference_id,
        product_id: input.product_id,
        product_name: name,
        stock: current_stock + input.quantity_delta,
        total,
    })
}

/// Tezgah sayfası için tek dokunuşluk işlem: negatif ise satış, pozitif ise stok girişi.
pub fn quick_movement(connection: &mut Connection, input: QuickMovementInput) -> AppResult<MovementResult> {
    if input.quantity_delta == 0 {
        return Err(AppError::Validation("Adet sıfır olamaz.".into()));
    }
    let price: Option<i64> = connection
        .query_row(
            "SELECT sale_price FROM products WHERE id=?1 AND archived_at IS NULL",
            [input.product_id],
            |row| row.get(0),
        )
        .optional()?;
    let sale_price = price.ok_or_else(|| AppError::Validation("Ürün bulunamadı.".into()))?;

    let is_sale = input.quantity_delta < 0;
    record_stock_movement(
        connection,
        StockMovementInput {
            product_id: input.product_id,
            movement_type: if is_sale { "sale".into() } else { "stock_in".into() },
            quantity_delta: input.quantity_delta,
            unit_price: if is_sale { sale_price } else { 0 },
            payment_method: "cash".into(),
            note: if is_sale { "Tezgah satışı".into() } else { "Tezgah stok girişi".into() },
        },
    )
}

pub fn list_sales(connection: &Connection, limit: i64) -> AppResult<Vec<Sale>> {
    let limit = limit.clamp(1, 500);
    let mut statement = connection.prepare(
        r#"SELECT s.id, s.sale_date, s.total, s.payment_method, s.note, s.status,
                  COALESCE(SUM(ABS(si.quantity)), 0) AS item_count,
                  COALESCE(GROUP_CONCAT(p.name || ' × ' || ABS(si.quantity), ', '), '') AS summary
           FROM sales s
           LEFT JOIN sale_items si ON si.sale_id = s.id
           LEFT JOIN products p ON p.id = si.product_id
           GROUP BY s.id
           ORDER BY s.id DESC
           LIMIT ?1"#,
    )?;
    let sales: Vec<Sale> = statement
        .query_map([limit], |row| {
            Ok(Sale {
                id: row.get(0)?,
                sale_date: row.get(1)?,
                total: row.get(2)?,
                payment_method: row.get(3)?,
                note: row.get(4)?,
                status: row.get(5)?,
                item_count: row.get(6)?,
                summary: row.get(7)?,
                items: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut item_statement = connection.prepare(
        r#"SELECT si.product_id, COALESCE(p.name, 'Silinmiş ürün'), si.quantity, si.unit_price, si.unit_cost
           FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = ?1"#,
    )?;
    let mut result = Vec::with_capacity(sales.len());
    for mut sale in sales {
        sale.items = item_statement
            .query_map([sale.id], |row| {
                Ok(SaleItem {
                    product_id: row.get(0)?,
                    product_name: row.get(1)?,
                    quantity: row.get(2)?,
                    unit_price: row.get(3)?,
                    unit_cost: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        result.push(sale);
    }
    Ok(result)
}

/// Yanlış yapılan bir satışı geri alır: stoğu iade eder, ciroyu ve satılan adedini düşürür.
pub fn void_sale(connection: &mut Connection, sale_id: i64) -> AppResult<()> {
    let tx = connection.transaction()?;
    let status: Option<String> = tx
        .query_row("SELECT status FROM sales WHERE id=?1", [sale_id], |row| row.get(0))
        .optional()?;
    let status = status.ok_or_else(|| AppError::Validation("Satış kaydı bulunamadı.".into()))?;
    if status != "completed" {
        return Err(AppError::Validation("Bu işlem zaten geri alınmış.".into()));
    }

    let items: Vec<(i64, i64, i64)> = {
        let mut statement = tx.prepare(
            "SELECT product_id, quantity, unit_cost FROM sale_items WHERE sale_id = ?1",
        )?;
        let rows = statement.query_map([sale_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    if items.is_empty() {
        return Err(AppError::Validation("Geri alınacak ürün bulunamadı.".into()));
    }

    let timestamp = now();
    let mut names = Vec::new();
    for (product_id, quantity, unit_cost) in items {
        let row: Option<(String, i64)> = tx
            .query_row(
                r#"SELECT p.name, COALESCE(SUM(sm.quantity_delta),0)
                   FROM products p LEFT JOIN stock_movements sm ON sm.product_id = p.id
                   WHERE p.id = ?1 GROUP BY p.id"#,
                [product_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let (name, current_stock) =
            row.ok_or_else(|| AppError::Validation("Satıştaki ürün artık kayıtlı değil.".into()))?;

        // Satışta quantity pozitif, iadede negatiftir; ters hareket tam olarak bu değerdir.
        if current_stock + quantity < 0 {
            return Err(AppError::Validation(format!(
                "{} için stok yetersiz, iade geri alınamıyor. Mevcut: {}",
                name, current_stock
            )));
        }
        tx.execute(
            r#"INSERT INTO stock_movements(product_id,movement_type,quantity_delta,unit_cost,unit_price,
               reference_type,reference_id,note,created_at)
               VALUES(?1,'sale_void',?2,?3,0,'sale',?4,'İşlem geri alındı',?5)"#,
            params![product_id, quantity, unit_cost, sale_id, timestamp],
        )?;
        tx.execute("UPDATE products SET updated_at=?1 WHERE id=?2", params![timestamp, product_id])?;
        names.push(format!("{} × {}", name, quantity.abs()));
    }

    tx.execute("UPDATE sales SET status='voided' WHERE id=?1", [sale_id])?;
    audit(&tx, "sale", sale_id, "voided", &format!("{} işlemi geri alındı", names.join(", ")))?;
    tx.commit()?;
    Ok(())
}

// ------------------------------------------------------------------- repairs

pub fn list_repairs(connection: &Connection) -> AppResult<Vec<Repair>> {
    let mut statement = connection.prepare(
        r#"SELECT id,ticket_no,customer_name,customer_phone,brand,model,imei,problem,status,
           received_at,planned_delivery_at,estimated_cost,charged_amount,deposit_amount,notes,created_at,updated_at
           FROM repairs WHERE archived_at IS NULL
           ORDER BY CASE status WHEN 'ready' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'received' THEN 2 ELSE 3 END,
                    planned_delivery_at='', planned_delivery_at, updated_at DESC"#,
    )?;
    let rows = statement.query_map([], |row| Ok(Repair {
        id: row.get(0)?, ticket_no: row.get(1)?, customer_name: row.get(2)?, customer_phone: row.get(3)?,
        brand: row.get(4)?, model: row.get(5)?, imei: row.get(6)?, problem: row.get(7)?, status: row.get(8)?,
        received_at: row.get(9)?, planned_delivery_at: row.get(10)?, estimated_cost: row.get(11)?,
        charged_amount: row.get(12)?, deposit_amount: row.get(13)?, notes: row.get(14)?,
        created_at: row.get(15)?, updated_at: row.get(16)?,
    }))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn save_repair(connection: &mut Connection, input: RepairInput) -> AppResult<i64> {
    if input.brand.trim().is_empty() || input.model.trim().is_empty() || input.problem.trim().is_empty() {
        return Err(AppError::Validation("Marka, model ve sorun alanları zorunludur.".into()));
    }
    let statuses = ["received", "diagnosis", "waiting_approval", "waiting_part", "in_progress", "ready", "delivered", "cancelled"];
    if !statuses.contains(&input.status.as_str()) {
        return Err(AppError::Validation("Geçersiz tamir durumu.".into()));
    }
    if input.estimated_cost < 0 || input.charged_amount < 0 || input.deposit_amount < 0 {
        return Err(AppError::Validation("Tutarlar negatif olamaz.".into()));
    }

    let tx = connection.transaction()?;
    let timestamp = now();
    // Teslim edildiğinde tarih damgası düşülür; ciro raporu bu tarihi kullanır.
    let delivered_at = if input.status == "delivered" { Some(timestamp.clone()) } else { None };

    let id = if let Some(id) = input.id {
        let previous: Option<(String, Option<String>)> = tx
            .query_row(
                "SELECT status, delivered_at FROM repairs WHERE id=?1 AND archived_at IS NULL",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let (previous_status, previous_delivered) =
            previous.ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))?;
        // Zaten teslim edilmişse ilk teslim tarihi korunur.
        let delivered_at = if input.status == "delivered" {
            previous_delivered.or(delivered_at)
        } else {
            None
        };
        tx.execute(
            r#"UPDATE repairs SET customer_name=?1,customer_phone=?2,brand=?3,model=?4,imei=?5,
               problem=?6,status=?7,received_at=?8,planned_delivery_at=?9,estimated_cost=?10,
               charged_amount=?11,deposit_amount=?12,notes=?13,updated_at=?14,delivered_at=?15
               WHERE id=?16 AND archived_at IS NULL"#,
            params![input.customer_name.trim(),input.customer_phone.trim(),input.brand.trim(),input.model.trim(),
                input.imei.trim(),input.problem.trim(),input.status,input.received_at,input.planned_delivery_at,
                input.estimated_cost,input.charged_amount,input.deposit_amount,input.notes.trim(),timestamp,
                delivered_at,id],
        )?;
        let summary = if previous_status != input.status {
            format!("{} {} · {}", input.brand.trim(), input.model.trim(), status_label(&input.status))
        } else {
            format!("{} {} güncellendi", input.brand.trim(), input.model.trim())
        };
        audit(&tx, "repair", id, "updated", &summary)?;
        id
    } else {
        tx.execute(
            r#"INSERT INTO repairs(ticket_no,customer_name,customer_phone,brand,model,imei,problem,status,
               received_at,planned_delivery_at,estimated_cost,charged_amount,deposit_amount,notes,created_at,updated_at,delivered_at)
               VALUES('TEMP-'||lower(hex(randomblob(8))),?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14,?15)"#,
            params![input.customer_name.trim(),input.customer_phone.trim(),input.brand.trim(),input.model.trim(),
                input.imei.trim(),input.problem.trim(),input.status,input.received_at,input.planned_delivery_at,
                input.estimated_cost,input.charged_amount,input.deposit_amount,input.notes.trim(),timestamp,delivered_at],
        )?;
        let id = tx.last_insert_rowid();
        let ticket_no = format!("T-{}-{:04}", Local::now().format("%y"), id);
        tx.execute("UPDATE repairs SET ticket_no=?1 WHERE id=?2", params![ticket_no,id])?;
        log_repair_event(&tx, id, "created", &input.status, "Cihaz tamire alındı")?;
        audit(&tx,"repair",id,"created",&format!("{} {} tamire alındı",input.brand.trim(),input.model.trim()))?;
        id
    };
    tx.commit()?;
    Ok(id)
}

/* ------------------------------------------------------- tamir takibi -- */

fn log_repair_event(tx: &Transaction<'_>, repair_id: i64, kind: &str, status: &str, note: &str) -> AppResult<()> {
    tx.execute(
        "INSERT INTO repair_events(repair_id, kind, status, note, created_at) VALUES(?1,?2,?3,?4,?5)",
        params![repair_id, kind, status, note.trim(), now()],
    )?;
    Ok(())
}

fn repair_by_id(connection: &Connection, id: i64) -> AppResult<Repair> {
    connection
        .query_row(
            r#"SELECT id,ticket_no,customer_name,customer_phone,brand,model,imei,problem,status,
               received_at,planned_delivery_at,estimated_cost,charged_amount,deposit_amount,notes,created_at,updated_at
               FROM repairs WHERE id=?1 AND archived_at IS NULL"#,
            [id],
            |row| Ok(Repair {
                id: row.get(0)?, ticket_no: row.get(1)?, customer_name: row.get(2)?, customer_phone: row.get(3)?,
                brand: row.get(4)?, model: row.get(5)?, imei: row.get(6)?, problem: row.get(7)?, status: row.get(8)?,
                received_at: row.get(9)?, planned_delivery_at: row.get(10)?, estimated_cost: row.get(11)?,
                charged_amount: row.get(12)?, deposit_amount: row.get(13)?, notes: row.get(14)?,
                created_at: row.get(15)?, updated_at: row.get(16)?,
            }),
        )
        .optional()?
        .ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))
}

/// Takip panelinin tüm verisi: kayıt, parçalar, geçmiş ve parça maliyeti toplamı.
pub fn repair_detail(connection: &Connection, id: i64) -> AppResult<RepairDetail> {
    let repair = repair_by_id(connection, id)?;

    let mut part_statement = connection.prepare(
        "SELECT id, repair_id, name, cost, note, created_at FROM repair_parts WHERE repair_id=?1 ORDER BY id",
    )?;
    let parts: Vec<RepairPart> = part_statement
        .query_map([id], |row| Ok(RepairPart {
            id: row.get(0)?, repair_id: row.get(1)?, name: row.get(2)?,
            cost: row.get(3)?, note: row.get(4)?, created_at: row.get(5)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut event_statement = connection.prepare(
        "SELECT id, repair_id, kind, status, note, created_at FROM repair_events WHERE repair_id=?1 ORDER BY id DESC",
    )?;
    let events: Vec<RepairEvent> = event_statement
        .query_map([id], |row| Ok(RepairEvent {
            id: row.get(0)?, repair_id: row.get(1)?, kind: row.get(2)?,
            status: row.get(3)?, note: row.get(4)?, created_at: row.get(5)?,
        }))?
        .collect::<Result<Vec<_>, _>>()?;

    let parts_cost = parts.iter().map(|part| part.cost).sum();
    Ok(RepairDetail { repair, parts, events, parts_cost })
}

/// Yalnızca durumu değiştirir. Tutarlara dokunmaz, yanlışlıkla fiyat bozulmaz.
pub fn update_repair_status(connection: &mut Connection, input: RepairStatusInput) -> AppResult<()> {
    let statuses = ["received", "diagnosis", "waiting_approval", "waiting_part", "in_progress", "ready", "delivered", "cancelled"];
    if !statuses.contains(&input.status.as_str()) {
        return Err(AppError::Validation("Geçersiz tamir durumu.".into()));
    }

    let tx = connection.transaction()?;
    let previous: Option<(String, Option<String>)> = tx
        .query_row(
            "SELECT status, delivered_at FROM repairs WHERE id=?1 AND archived_at IS NULL",
            [input.repair_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let (previous_status, previous_delivered) =
        previous.ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))?;

    let timestamp = now();
    // Teslim edildiğinde tarih damgalanır; ciro raporu bunu kullanır.
    let delivered_at = if input.status == "delivered" {
        previous_delivered.or(Some(timestamp.clone()))
    } else {
        None
    };

    tx.execute(
        "UPDATE repairs SET status=?1, delivered_at=?2, updated_at=?3 WHERE id=?4",
        params![input.status, delivered_at, timestamp, input.repair_id],
    )?;

    let note = if input.note.trim().is_empty() {
        format!("Durum: {}", status_label(&input.status))
    } else {
        input.note.trim().to_string()
    };
    log_repair_event(&tx, input.repair_id, "status", &input.status, &note)?;

    if previous_status != input.status {
        let (brand, model): (String, String) = tx.query_row(
            "SELECT brand, model FROM repairs WHERE id=?1", [input.repair_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        audit(&tx, "repair", input.repair_id, "status",
            &format!("{} {} · {}", brand, model, status_label(&input.status)))?;
    }
    tx.commit()?;
    Ok(())
}

/// Tamire not ekler; durumu değiştirmez.
pub fn add_repair_note(connection: &mut Connection, repair_id: i64, note: String) -> AppResult<()> {
    if note.trim().is_empty() {
        return Err(AppError::Validation("Not boş olamaz.".into()));
    }
    let tx = connection.transaction()?;
    let status: Option<String> = tx
        .query_row("SELECT status FROM repairs WHERE id=?1 AND archived_at IS NULL", [repair_id], |row| row.get(0))
        .optional()?;
    let status = status.ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))?;
    log_repair_event(&tx, repair_id, "note", &status, &note)?;
    tx.execute("UPDATE repairs SET updated_at=?1 WHERE id=?2", params![now(), repair_id])?;
    tx.commit()?;
    Ok(())
}

/// Takılan parçayı ve maliyetini kaydeder.
pub fn add_repair_part(connection: &mut Connection, input: RepairPartInput) -> AppResult<i64> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("Parça adı boş bırakılamaz.".into()));
    }
    if input.cost < 0 {
        return Err(AppError::Validation("Parça maliyeti negatif olamaz.".into()));
    }
    let tx = connection.transaction()?;
    let status: Option<String> = tx
        .query_row("SELECT status FROM repairs WHERE id=?1 AND archived_at IS NULL", [input.repair_id], |row| row.get(0))
        .optional()?;
    let status = status.ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))?;

    tx.execute(
        "INSERT INTO repair_parts(repair_id, name, cost, note, created_at) VALUES(?1,?2,?3,?4,?5)",
        params![input.repair_id, input.name.trim(), input.cost, input.note.trim(), now()],
    )?;
    let id = tx.last_insert_rowid();
    log_repair_event(&tx, input.repair_id, "part", &status,
        &format!("Parça eklendi: {}", input.name.trim()))?;
    tx.execute("UPDATE repairs SET updated_at=?1 WHERE id=?2", params![now(), input.repair_id])?;
    tx.commit()?;
    Ok(id)
}

pub fn delete_repair_part(connection: &mut Connection, part_id: i64) -> AppResult<()> {
    let tx = connection.transaction()?;
    let row: Option<(i64, String, String)> = tx
        .query_row(
            "SELECT p.repair_id, p.name, r.status FROM repair_parts p JOIN repairs r ON r.id=p.repair_id WHERE p.id=?1",
            [part_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let (repair_id, name, status) = row.ok_or_else(|| AppError::Validation("Parça bulunamadı.".into()))?;
    tx.execute("DELETE FROM repair_parts WHERE id=?1", [part_id])?;
    log_repair_event(&tx, repair_id, "part", &status, &format!("Parça kaldırıldı: {}", name))?;
    tx.commit()?;
    Ok(())
}

/// Yalnızca tutarları günceller; durum ve diğer alanlara dokunmaz.
pub fn update_repair_charge(connection: &mut Connection, input: RepairChargeInput) -> AppResult<()> {
    if input.charged_amount < 0 || input.deposit_amount < 0 {
        return Err(AppError::Validation("Tutarlar negatif olamaz.".into()));
    }
    let tx = connection.transaction()?;
    let status: Option<String> = tx
        .query_row("SELECT status FROM repairs WHERE id=?1 AND archived_at IS NULL", [input.repair_id], |row| row.get(0))
        .optional()?;
    let status = status.ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))?;

    tx.execute(
        "UPDATE repairs SET charged_amount=?1, deposit_amount=?2, updated_at=?3 WHERE id=?4",
        params![input.charged_amount, input.deposit_amount, now(), input.repair_id],
    )?;
    let note = if input.note.trim().is_empty() { "Tutar güncellendi".to_string() } else { input.note.trim().to_string() };
    log_repair_event(&tx, input.repair_id, "charge", &status, &note)?;
    tx.commit()?;
    Ok(())
}

fn status_label(status: &str) -> &str {
    match status {
        "received" => "alındı",
        "diagnosis" => "inceleniyor",
        "waiting_approval" => "onay bekliyor",
        "waiting_part" => "parça bekliyor",
        "in_progress" => "tamirde",
        "ready" => "teslime hazır",
        "delivered" => "teslim edildi",
        "cancelled" => "iptal edildi",
        _ => "güncellendi",
    }
}

pub fn archive_repair(connection: &mut Connection, id: i64) -> AppResult<()> {
    let tx = connection.transaction()?;
    let row: Option<(String, String)> = tx
        .query_row(
            "SELECT brand, model FROM repairs WHERE id=?1 AND archived_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let (brand, model) = row.ok_or_else(|| AppError::Validation("Tamir kaydı bulunamadı.".into()))?;
    tx.execute("UPDATE repairs SET archived_at=?1, updated_at=?1 WHERE id=?2", params![now(), id])?;
    audit(&tx, "repair", id, "archived", &format!("{} {} kaydı silindi", brand, model))?;
    tx.commit()?;
    Ok(())
}

// ------------------------------------------------------------------ expenses

pub fn list_expenses(connection: &Connection) -> AppResult<Vec<Expense>> {
    let mut statement = connection.prepare(
        "SELECT id,category,description,amount,expense_date,payment_method,created_at FROM expenses WHERE archived_at IS NULL ORDER BY expense_date DESC,id DESC",
    )?;
    let rows = statement.query_map([], |row| Ok(Expense {
        id: row.get(0)?, category: row.get(1)?, description: row.get(2)?, amount: row.get(3)?,
        expense_date: row.get(4)?, payment_method: row.get(5)?, created_at: row.get(6)?,
    }))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn save_expense(connection: &mut Connection, input: ExpenseInput) -> AppResult<i64> {
    if input.description.trim().is_empty() || input.category.trim().is_empty() || input.amount <= 0 {
        return Err(AppError::Validation("Kategori, açıklama ve tutar zorunludur.".into()));
    }
    if NaiveDate::parse_from_str(&input.expense_date, "%Y-%m-%d").is_err() {
        return Err(AppError::Validation("Gider tarihi geçersiz.".into()));
    }
    let payment_method = if input.payment_method.trim().is_empty() { "cash" } else { input.payment_method.trim() };

    let tx = connection.transaction()?;
    let id = if let Some(id) = input.id {
        let changed = tx.execute(
            "UPDATE expenses SET category=?1,description=?2,amount=?3,expense_date=?4,payment_method=?5 WHERE id=?6 AND archived_at IS NULL",
            params![input.category.trim(),input.description.trim(),input.amount,input.expense_date,payment_method,id],
        )?;
        if changed == 0 { return Err(AppError::Validation("Gider kaydı bulunamadı.".into())); }
        audit(&tx,"expense",id,"updated",&format!("{} gideri güncellendi",input.description.trim()))?;
        id
    } else {
        tx.execute(
            "INSERT INTO expenses(category,description,amount,expense_date,payment_method,created_at) VALUES(?1,?2,?3,?4,?5,?6)",
            params![input.category.trim(),input.description.trim(),input.amount,input.expense_date,payment_method,now()],
        )?;
        let id = tx.last_insert_rowid();
        audit(&tx,"expense",id,"created",&format!("{} gideri eklendi",input.description.trim()))?;
        id
    };
    tx.commit()?;
    Ok(id)
}

pub fn archive_expense(connection: &mut Connection, id: i64) -> AppResult<()> {
    let tx = connection.transaction()?;
    let description: Option<String> = tx
        .query_row("SELECT description FROM expenses WHERE id=?1 AND archived_at IS NULL", [id], |row| row.get(0))
        .optional()?;
    let description = description.ok_or_else(|| AppError::Validation("Gider kaydı bulunamadı.".into()))?;
    tx.execute("UPDATE expenses SET archived_at=?1 WHERE id=?2", params![now(), id])?;
    audit(&tx, "expense", id, "archived", &format!("{} gideri silindi", description))?;
    tx.commit()?;
    Ok(())
}

// ------------------------------------------------------------------ settings

pub fn load_settings(connection: &Connection) -> AppResult<Settings> {
    let mut statement = connection.prepare("SELECT key, value FROM app_settings")?;
    let stored: HashMap<String, String> = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<HashMap<_, _>, _>>()?;
    let get = |key: &str, fallback: &str| stored.get(key).cloned().unwrap_or_else(|| fallback.to_string());
    Ok(Settings {
        shop_name: get("shopName", "Dükkan"),
        shop_phone: get("shopPhone", ""),
        theme: get("theme", "light"),
        density: get("density", "comfortable"),
        auto_backup: get("autoBackup", "1"),
        backup_dir: get("backupDir", ""),
        confirm_quick_sale: get("confirmQuickSale", "0"),
    })
}

pub fn save_settings(connection: &mut Connection, input: Settings) -> AppResult<Settings> {
    let tx = connection.transaction()?;
    let pairs = [
        ("shopName", input.shop_name.trim()),
        ("shopPhone", input.shop_phone.trim()),
        ("theme", input.theme.trim()),
        ("density", input.density.trim()),
        ("autoBackup", input.auto_backup.trim()),
        ("backupDir", input.backup_dir.trim()),
        ("confirmQuickSale", input.confirm_quick_sale.trim()),
    ];
    for (key, value) in pairs {
        tx.execute(
            "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
    }
    tx.commit()?;
    load_settings(connection)
}

// ----------------------------------------------------------------- dashboard

pub fn dashboard(connection: &Connection) -> AppResult<DashboardData> {
    let today = today();
    let month = Local::now().format("%Y-%m").to_string();

    let sales_revenue = |scope: &str, value: &str| -> AppResult<i64> {
        let sql = format!(
            "SELECT COALESCE(SUM(total),0) FROM sales WHERE status='completed' AND substr(sale_date,1,{}) = ?1",
            scope
        );
        Ok(connection.query_row(&sql, [value], |row| row.get(0))?)
    };
    let repair_revenue = |scope: &str, value: &str| -> AppResult<i64> {
        let sql = format!(
            "SELECT COALESCE(SUM(charged_amount),0) FROM repairs WHERE archived_at IS NULL AND status='delivered' AND delivered_at IS NOT NULL AND substr(delivered_at,1,{}) = ?1",
            scope
        );
        Ok(connection.query_row(&sql, [value], |row| row.get(0))?)
    };
    let cost_of_goods = |scope: &str, value: &str| -> AppResult<i64> {
        let sql = format!(
            r#"SELECT COALESCE(SUM(si.quantity*si.unit_cost),0) FROM sale_items si
               JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND substr(s.sale_date,1,{}) = ?1"#,
            scope
        );
        Ok(connection.query_row(&sql, [value], |row| row.get(0))?)
    };

    let today_revenue = sales_revenue("10", &today)? + repair_revenue("10", &today)?;
    let today_profit = today_revenue - cost_of_goods("10", &today)?;
    let month_revenue = sales_revenue("7", &month)? + repair_revenue("7", &month)?;
    let month_cost = cost_of_goods("7", &month)?;
    let month_expenses: i64 = connection.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE archived_at IS NULL AND substr(expense_date,1,7)=?1", [&month], |r| r.get(0),
    )?;
    let today_sale_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sales WHERE status='completed' AND total > 0 AND substr(sale_date,1,10)=?1", [&today], |r| r.get(0),
    )?;
    let active_repairs = connection.query_row(
        "SELECT COUNT(*) FROM repairs WHERE archived_at IS NULL AND status NOT IN ('delivered','cancelled')", [], |r| r.get(0),
    )?;
    let ready_repairs = connection.query_row(
        "SELECT COUNT(*) FROM repairs WHERE archived_at IS NULL AND status = 'ready'", [], |r| r.get(0),
    )?;
    let overdue_repairs = connection.query_row(
        "SELECT COUNT(*) FROM repairs WHERE archived_at IS NULL AND status NOT IN ('delivered','cancelled') AND planned_delivery_at<>'' AND substr(planned_delivery_at,1,10)<?1", [&today], |r| r.get(0),
    )?;
    let low_stock_count = connection.query_row(
        r#"SELECT COUNT(*) FROM (SELECT p.id,p.minimum_stock,COALESCE(SUM(sm.quantity_delta),0) stock
           FROM products p LEFT JOIN stock_movements sm ON sm.product_id=p.id
           WHERE p.archived_at IS NULL AND p.minimum_stock>0 GROUP BY p.id HAVING stock<=p.minimum_stock)"#, [], |r| r.get(0),
    )?;
    let stock_value = current_stock_value(connection)?;

    let mut statement = connection.prepare("SELECT id,summary,action,created_at FROM audit_log ORDER BY id DESC LIMIT 8")?;
    let activities = statement.query_map([], |row| Ok(ActivityItem {
        id: row.get(0)?, summary: row.get(1)?, action: row.get(2)?, created_at: row.get(3)?,
    }))?.collect::<Result<Vec<_>, _>>()?;

    Ok(DashboardData {
        today_revenue,
        today_profit,
        month_revenue,
        month_profit: month_revenue - month_cost - month_expenses,
        month_expenses,
        active_repairs,
        ready_repairs,
        overdue_repairs,
        low_stock_count,
        stock_value,
        today_sale_count,
        recent_activity: activities,
    })
}

fn current_stock_value(connection: &Connection) -> AppResult<i64> {
    Ok(connection.query_row(
        r#"SELECT COALESCE(SUM(stock*p.purchase_price),0) FROM (SELECT product_id,SUM(quantity_delta) stock
           FROM stock_movements GROUP BY product_id) s JOIN products p ON p.id=s.product_id
           WHERE p.archived_at IS NULL AND stock>0"#, [], |r| r.get(0),
    )?)
}

// ------------------------------------------------------------------- reports

fn daily_totals(connection: &Connection, sql: &str, start: &str, end: &str) -> AppResult<HashMap<String, i64>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params![start, end], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
}

pub fn report(connection: &Connection, start: &str, end: &str) -> AppResult<ReportData> {
    let start_date = NaiveDate::parse_from_str(start, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Başlangıç tarihi geçersiz.".into()))?;
    let end_date = NaiveDate::parse_from_str(end, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("Bitiş tarihi geçersiz.".into()))?;
    if end_date < start_date { return Err(AppError::Validation("Tarih aralığı geçersiz.".into())); }
    if (end_date - start_date).num_days() > 1830 {
        return Err(AppError::Validation("Tarih aralığı en fazla 5 yıl olabilir.".into()));
    }

    let revenue: i64 = connection.query_row(
        "SELECT COALESCE(SUM(total),0) FROM sales WHERE status='completed' AND substr(sale_date,1,10) BETWEEN ?1 AND ?2",
        params![start,end], |r| r.get(0),
    )?;
    let repair_income: i64 = connection.query_row(
        r#"SELECT COALESCE(SUM(charged_amount),0) FROM repairs
           WHERE archived_at IS NULL AND status='delivered' AND delivered_at IS NOT NULL
             AND substr(delivered_at,1,10) BETWEEN ?1 AND ?2"#,
        params![start,end], |r| r.get(0),
    )?;
    let cost_of_goods: i64 = connection.query_row(
        r#"SELECT COALESCE(SUM(si.quantity*si.unit_cost),0) FROM sale_items si JOIN sales s ON s.id=si.sale_id
           WHERE s.status='completed' AND substr(s.sale_date,1,10) BETWEEN ?1 AND ?2"#,
        params![start,end], |r| r.get(0),
    )?;
    let expenses: i64 = connection.query_row(
        "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE archived_at IS NULL AND expense_date BETWEEN ?1 AND ?2",
        params![start,end], |r| r.get(0),
    )?;
    let sale_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sales WHERE status='completed' AND total > 0 AND substr(sale_date,1,10) BETWEEN ?1 AND ?2",
        params![start,end], |r| r.get(0),
    )?;
    let stock_value = current_stock_value(connection)?;

    // Gün gün döngüyle sorgu atmak yerine üç toplu sorgu çalıştırılır.
    let revenue_by_day = daily_totals(
        connection,
        r#"SELECT substr(sale_date,1,10) AS d, COALESCE(SUM(total),0) FROM sales
           WHERE status='completed' AND d BETWEEN ?1 AND ?2 GROUP BY d"#,
        start, end,
    )?;
    let repair_by_day = daily_totals(
        connection,
        r#"SELECT substr(delivered_at,1,10) AS d, COALESCE(SUM(charged_amount),0) FROM repairs
           WHERE archived_at IS NULL AND status='delivered' AND delivered_at IS NOT NULL
             AND d BETWEEN ?1 AND ?2 GROUP BY d"#,
        start, end,
    )?;
    let cost_by_day = daily_totals(
        connection,
        r#"SELECT substr(s.sale_date,1,10) AS d, COALESCE(SUM(si.quantity*si.unit_cost),0)
           FROM sale_items si JOIN sales s ON s.id=si.sale_id
           WHERE s.status='completed' AND d BETWEEN ?1 AND ?2 GROUP BY d"#,
        start, end,
    )?;
    let expense_by_day = daily_totals(
        connection,
        r#"SELECT expense_date AS d, COALESCE(SUM(amount),0) FROM expenses
           WHERE archived_at IS NULL AND d BETWEEN ?1 AND ?2 GROUP BY d"#,
        start, end,
    )?;

    let mut series = Vec::new();
    let mut cursor = start_date;
    while cursor <= end_date {
        let date = cursor.format("%Y-%m-%d").to_string();
        let day_revenue = revenue_by_day.get(&date).copied().unwrap_or(0)
            + repair_by_day.get(&date).copied().unwrap_or(0);
        let day_cost = cost_by_day.get(&date).copied().unwrap_or(0);
        let day_expenses = expense_by_day.get(&date).copied().unwrap_or(0);
        series.push(ReportPoint {
            date,
            revenue: day_revenue,
            profit: day_revenue - day_cost - day_expenses,
            expenses: day_expenses,
        });
        cursor += Duration::days(1);
    }

    let mut top_statement = connection.prepare(
        r#"SELECT p.name,COALESCE(SUM(si.quantity),0) quantity,COALESCE(SUM(si.quantity*si.unit_price),0) revenue
           FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
           WHERE s.status='completed' AND substr(s.sale_date,1,10) BETWEEN ?1 AND ?2
           GROUP BY p.id HAVING quantity>0 ORDER BY quantity DESC LIMIT 5"#,
    )?;
    let top_products = top_statement.query_map(params![start,end], |row| Ok(TopProduct {
        name: row.get(0)?, quantity: row.get(1)?, revenue: row.get(2)?,
    }))?.collect::<Result<Vec<_>, _>>()?;

    let mut category_statement = connection.prepare(
        r#"SELECT CASE WHEN TRIM(p.category) = '' THEN 'Diğer' ELSE p.category END AS name,
                  COALESCE(SUM(si.quantity),0) quantity,
                  COALESCE(SUM(si.quantity*si.unit_price),0) revenue
           FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
           WHERE s.status='completed' AND substr(s.sale_date,1,10) BETWEEN ?1 AND ?2
           GROUP BY name HAVING revenue <> 0 ORDER BY revenue DESC"#,
    )?;
    let category_totals = category_statement.query_map(params![start,end], |row| Ok(CategoryTotal {
        name: row.get(0)?, quantity: row.get(1)?, revenue: row.get(2)?,
    }))?.collect::<Result<Vec<_>, _>>()?;

    // Teslim edilen tamirlerde kullanılan parçaların maliyeti de kâra düşer.
    let repair_parts_cost: i64 = connection.query_row(
        r#"SELECT COALESCE(SUM(p.cost),0) FROM repair_parts p
           JOIN repairs r ON r.id = p.repair_id
           WHERE r.archived_at IS NULL AND r.status='delivered' AND r.delivered_at IS NOT NULL
             AND substr(r.delivered_at,1,10) BETWEEN ?1 AND ?2"#,
        params![start, end], |r| r.get(0),
    )?;

    let total_revenue = revenue + repair_income;
    // Ürün maliyeti ile parça maliyeti birlikte "satılan malın maliyeti"ni oluşturur.
    let total_cost = cost_of_goods + repair_parts_cost;
    Ok(ReportData {
        revenue: total_revenue,
        cost_of_goods: total_cost,
        gross_profit: total_revenue - total_cost,
        expenses,
        net_profit: total_revenue - total_cost - expenses,
        stock_value,
        sale_count,
        repair_income,
        repair_parts_cost,
        series,
        top_products,
        category_totals,
    })
}

// -------------------------------------------------------------------- backup

pub fn create_backup(connection: &Connection, data_dir: &Path, destination: Option<PathBuf>) -> AppResult<BackupResult> {
    let backup_dir = destination.unwrap_or_else(|| data_dir.join("backups"));
    fs::create_dir_all(&backup_dir)?;
    let timestamp = Local::now();
    let filename = format!("dukkan-yedek-{}.sqlite", timestamp.format("%Y%m%d-%H%M%S-%3f"));
    let path = backup_dir.join(filename);
    let mut destination_connection = Connection::open(&path)?;
    {
        let backup = rusqlite::backup::Backup::new(connection, &mut destination_connection)?;
        backup.run_to_completion(5, std::time::Duration::from_millis(100), None)?;
    }
    let integrity: String = destination_connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Validation("Yedek doğrulaması başarısız oldu.".into()));
    }
    prune_backups(&backup_dir);
    Ok(BackupResult { path: path.to_string_lossy().to_string(), created_at: timestamp.to_rfc3339() })
}

/// Tüm iş verisini siler ve uygulamayı ilk kurulum hâline döndürür.
/// Yanlışlıkla basılma riskine karşı önce otomatik yedek alınır.
/// Ayarlar (tema, dükkan adı) korunur; kategoriler varsayılana döner.
pub fn reset_all_data(connection: &mut Connection, data_dir: &Path) -> AppResult<BackupResult> {
    let backup = create_backup(connection, data_dir, None)?;

    let tx = connection.transaction()?;
    // Sıra önemli: alt kayıtlar önce silinir, yabancı anahtar kısıtı bozulmaz.
    tx.execute_batch(
        r#"
        DELETE FROM sale_items;
        DELETE FROM sales;
        DELETE FROM stock_movements;
        DELETE FROM products;
        DELETE FROM repair_parts;
        DELETE FROM repair_events;
        DELETE FROM repairs;
        DELETE FROM expenses;
        DELETE FROM audit_log;
        DELETE FROM categories;
        "#,
    )?;
    // Kimlik sayaçlarını sıfırla: yeni kayıtlar 1'den başlasın.
    let has_sequence = tx
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")?
        .exists([])?;
    if has_sequence {
        tx.execute("DELETE FROM sqlite_sequence", [])?;
    }
    tx.commit()?;

    seed_categories(connection)?;
    // Boşalan alanı diske geri ver (transaction dışında çalışmalı).
    connection.execute_batch("VACUUM;")?;
    Ok(backup)
}

/// Yedekler sınırsız birikmesin: en yeni `KEEP` tanesi kalır, eskiler silinir.
/// Böylece disk şişmez ve eski müşteri verisi süresiz saklanmaz.
const BACKUP_KEEP: usize = 20;

fn prune_backups(backup_dir: &Path) {
    let Ok(entries) = fs::read_dir(backup_dir) else { return };
    let mut backups: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension().is_some_and(|ext| ext == "sqlite")
                && entry.file_name().to_string_lossy().starts_with("dukkan-yedek-")
        })
        .collect();
    if backups.len() <= BACKUP_KEEP {
        return;
    }
    // Dosya adı zaman damgası içerdiği için ada göre sıralamak tarih sırası verir.
    backups.sort_by_key(|entry| entry.file_name());
    let silinecek = backups.len() - BACKUP_KEEP;
    for entry in backups.into_iter().take(silinecek) {
        let _ = fs::remove_file(entry.path());
    }
}

/// Geri yüklenecek dosyanın gerçekten bu uygulamanın veritabanı olduğunu doğrular.
fn validate_backup_schema(source: &Connection) -> AppResult<()> {
    for tablo in ["products", "sales", "sale_items", "stock_movements", "repairs", "expenses"] {
        let var = source
            .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1")?
            .exists([tablo])?;
        if !var {
            return Err(AppError::Validation(format!(
                "Bu dosya Dükkan Paneli yedeği değil ('{}' tablosu yok).",
                tablo
            )));
        }
    }
    // Beklenmeyen tetikleyici/görünüm içeren dosyalar reddedilir.
    let supheli: i64 = source.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('trigger','view')",
        [],
        |row| row.get(0),
    )?;
    if supheli > 0 {
        return Err(AppError::Validation(
            "Yedek dosyası beklenmeyen tetikleyici veya görünüm içeriyor, güvenlik için yüklenmedi.".into(),
        ));
    }
    Ok(())
}

pub fn restore_backup(connection: &mut Connection, data_dir: &Path, source: &Path) -> AppResult<()> {
    if !source.is_file() {
        return Err(AppError::Validation("Yedek dosyası bulunamadı.".into()));
    }
    let source_connection = Connection::open_with_flags(source, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = source_connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Validation("Seçilen yedek dosyası sağlam değil.".into()));
    }
    validate_backup_schema(&source_connection)?;

    create_backup(connection, data_dir, None)?;
    {
        let backup = rusqlite::backup::Backup::new(&source_connection, connection)?;
        backup.run_to_completion(5, std::time::Duration::from_millis(100), None)?;
    }
    connection.pragma_update(None, "foreign_keys", "ON")?;
    migrate(connection)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate(&connection).unwrap();
        connection
    }

    fn sample_product(stock: i64) -> ProductInput {
        ProductInput {
            id: None,
            product_type: "bulk".into(),
            name: "Test Kablo".into(),
            brand: "Test".into(),
            model: "K1".into(),
            category: "Kablo".into(),
            sku: "K-1".into(),
            barcode: String::new(),
            imei: String::new(),
            description: String::new(),
            initial_stock: stock,
            minimum_stock: 2,
            purchase_price: 10_000,
            sale_price: 20_000,
        }
    }

    fn sell(connection: &mut Connection, product_id: i64, quantity: i64) -> MovementResult {
        record_stock_movement(connection, StockMovementInput {
            product_id,
            movement_type: "sale".into(),
            quantity_delta: -quantity,
            unit_price: 20_000,
            payment_method: String::new(),
            note: String::new(),
        }).unwrap()
    }

    #[test]
    fn sale_updates_stock_and_finance_together() {
        let mut connection = test_connection();
        let product_id = save_product(&mut connection, sample_product(5)).unwrap();
        sell(&mut connection, product_id, 2);

        let product = list_products(&connection, "").unwrap().remove(0);
        let sale_total: i64 = connection.query_row("SELECT total FROM sales", [], |row| row.get(0)).unwrap();
        assert_eq!(product.stock, 3);
        assert_eq!(product.sold_count, 2);
        assert_eq!(sale_total, 40_000);
    }

    #[test]
    fn insufficient_stock_rolls_back_everything() {
        let mut connection = test_connection();
        let product_id = save_product(&mut connection, sample_product(1)).unwrap();
        let result = record_stock_movement(&mut connection, StockMovementInput {
            product_id,
            movement_type: "sale".into(),
            quantity_delta: -2,
            unit_price: 20_000,
            payment_method: String::new(),
            note: String::new(),
        });

        assert!(result.is_err());
        let stock = list_products(&connection, "").unwrap().remove(0).stock;
        let sale_count: i64 = connection.query_row("SELECT COUNT(*) FROM sales", [], |row| row.get(0)).unwrap();
        assert_eq!(stock, 1);
        assert_eq!(sale_count, 0);
    }

    #[test]
    fn voiding_a_sale_restores_stock_and_removes_revenue() {
        let mut connection = test_connection();
        let product_id = save_product(&mut connection, sample_product(5)).unwrap();
        let result = sell(&mut connection, product_id, 2);
        let sale_id = result.sale_id.unwrap();

        void_sale(&mut connection, sale_id).unwrap();

        let product = list_products(&connection, "").unwrap().remove(0);
        assert_eq!(product.stock, 5, "stok satıştan önceki haline dönmeli");
        assert_eq!(product.sold_count, 0, "satılan adedi sıfırlanmalı");

        let date = today();
        let report = report(&connection, &date, &date).unwrap();
        assert_eq!(report.revenue, 0, "geri alınan satış ciroya girmemeli");
        assert_eq!(report.cost_of_goods, 0);

        let dashboard = dashboard(&connection).unwrap();
        assert_eq!(dashboard.today_revenue, 0);
    }

    #[test]
    fn a_sale_cannot_be_voided_twice() {
        let mut connection = test_connection();
        let product_id = save_product(&mut connection, sample_product(3)).unwrap();
        let sale_id = sell(&mut connection, product_id, 1).sale_id.unwrap();
        void_sale(&mut connection, sale_id).unwrap();
        assert!(void_sale(&mut connection, sale_id).is_err());
    }

    #[test]
    fn report_separates_revenue_cost_and_expense() {
        let mut connection = test_connection();
        let product_id = save_product(&mut connection, sample_product(4)).unwrap();
        sell(&mut connection, product_id, 1);
        save_expense(&mut connection, ExpenseInput {
            id: None,
            category: "Sarf".into(),
            description: "Test gideri".into(),
            amount: 2_500,
            expense_date: today(),
            payment_method: "cash".into(),
        }).unwrap();
        let date = today();
        let result = report(&connection, &date, &date).unwrap();
        assert_eq!(result.revenue, 20_000);
        assert_eq!(result.cost_of_goods, 10_000);
        assert_eq!(result.expenses, 2_500);
        assert_eq!(result.net_profit, 7_500);
        assert_eq!(result.series.len(), 1);
        assert_eq!(result.series[0].revenue, 20_000);
    }

    #[test]
    fn delivered_repair_income_reaches_reports_and_dashboard() {
        let mut connection = test_connection();
        let repair = RepairInput {
            id: None,
            customer_name: "Ahmet".into(),
            customer_phone: "05320000000".into(),
            brand: "Samsung".into(),
            model: "A54".into(),
            imei: String::new(),
            problem: "Ekran".into(),
            status: "in_progress".into(),
            received_at: today(),
            planned_delivery_at: String::new(),
            estimated_cost: 0,
            charged_amount: 150_000,
            deposit_amount: 0,
            notes: String::new(),
        };
        let id = save_repair(&mut connection, repair).unwrap();

        let date = today();
        assert_eq!(report(&connection, &date, &date).unwrap().repair_income, 0);

        save_repair(&mut connection, RepairInput {
            id: Some(id),
            customer_name: "Ahmet".into(),
            customer_phone: "05320000000".into(),
            brand: "Samsung".into(),
            model: "A54".into(),
            imei: String::new(),
            problem: "Ekran".into(),
            status: "delivered".into(),
            received_at: date.clone(),
            planned_delivery_at: String::new(),
            estimated_cost: 0,
            charged_amount: 150_000,
            deposit_amount: 0,
            notes: String::new(),
        }).unwrap();

        let result = report(&connection, &date, &date).unwrap();
        assert_eq!(result.repair_income, 150_000);
        assert_eq!(result.revenue, 150_000, "tamir geliri ciroya eklenmeli");
        assert_eq!(dashboard(&connection).unwrap().today_revenue, 150_000);
    }

    #[test]
    fn quick_movement_sells_one_at_list_price() {
        let mut connection = test_connection();
        let product_id = save_product(&mut connection, sample_product(4)).unwrap();
        let result = quick_movement(&mut connection, QuickMovementInput { product_id, quantity_delta: -1 }).unwrap();
        assert_eq!(result.stock, 3);
        assert_eq!(result.total, 20_000);
        assert!(result.sale_id.is_some(), "geri alınabilmesi için satış kimliği dönmeli");
    }

    #[test]
    fn products_always_land_in_a_category() {
        let mut connection = test_connection();
        let mut input = sample_product(1);
        input.category = String::new();
        input.product_type = "device".into();
        save_product(&mut connection, input).unwrap();
        let product = list_products(&connection, "").unwrap().remove(0);
        assert_eq!(product.category, "Telefon");
        let categories = list_categories(&connection).unwrap();
        assert!(categories.iter().any(|category| category.name == "Telefon"));
    }

    #[test]
    fn duplicate_imei_is_rejected() {
        let mut connection = test_connection();
        let mut first = sample_product(1);
        first.product_type = "device".into();
        first.imei = "351234567890482".into();
        save_product(&mut connection, first).unwrap();

        let mut second = sample_product(1);
        second.product_type = "device".into();
        second.imei = "351234567890482".into();
        second.name = "Başka telefon".into();
        assert!(save_product(&mut connection, second).is_err());
    }

    #[test]
    fn renaming_a_category_moves_its_products() {
        let mut connection = test_connection();
        save_product(&mut connection, sample_product(2)).unwrap();
        let category = list_categories(&connection).unwrap().into_iter().find(|item| item.name == "Kablo").unwrap();
        save_category(&mut connection, CategoryInput {
            id: Some(category.id),
            name: "Kablolar".into(),
            icon: category.icon,
            color: category.color,
            sort_order: category.sort_order,
        }).unwrap();
        assert_eq!(list_products(&connection, "").unwrap().remove(0).category, "Kablolar");
    }

    #[test]
    fn settings_round_trip() {
        let mut connection = test_connection();
        assert_eq!(load_settings(&connection).unwrap().shop_name, "Dükkan");
        let saved = save_settings(&mut connection, Settings {
            shop_name: "Yusuf Telekom".into(),
            shop_phone: "05320000000".into(),
            theme: "dark".into(),
            density: "compact".into(),
            auto_backup: "1".into(),
            backup_dir: String::new(),
            confirm_quick_sale: "1".into(),
        }).unwrap();
        assert_eq!(saved.shop_name, "Yusuf Telekom");
        assert_eq!(load_settings(&connection).unwrap().theme, "dark");
    }

    #[test]
    fn expense_can_be_edited_and_removed() {
        let mut connection = test_connection();
        let id = save_expense(&mut connection, ExpenseInput {
            id: None, category: "Kira".into(), description: "Ağustos".into(),
            amount: 5_000, expense_date: today(), payment_method: String::new(),
        }).unwrap();
        save_expense(&mut connection, ExpenseInput {
            id: Some(id), category: "Kira".into(), description: "Ağustos kirası".into(),
            amount: 7_500, expense_date: today(), payment_method: "transfer".into(),
        }).unwrap();
        assert_eq!(list_expenses(&connection).unwrap()[0].amount, 7_500);
        archive_expense(&mut connection, id).unwrap();
        assert!(list_expenses(&connection).unwrap().is_empty());
    }

    /// Yeni kurulumda uygulama KESİNLİKLE boş açılmalı. Hiç kimsenin verisi,
    /// hiçbir örnek/deneme kaydı yeni bir bilgisayara gitmemeli.
    #[test]
    fn fresh_install_starts_completely_empty() {
        let connection = test_connection();

        for tablo in ["products", "sales", "sale_items", "stock_movements", "repairs", "expenses", "audit_log"] {
            let adet: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {}", tablo), [], |row| row.get(0))
                .unwrap();
            assert_eq!(adet, 0, "yeni kurulumda '{}' tablosu boş olmalı, {} kayıt bulundu", tablo, adet);
        }

        // Gösterge panosundaki her tutar sıfır olmalı.
        let gosterge = dashboard(&connection).unwrap();
        assert_eq!(gosterge.today_revenue, 0);
        assert_eq!(gosterge.month_revenue, 0);
        assert_eq!(gosterge.month_profit, 0);
        assert_eq!(gosterge.stock_value, 0);
        assert_eq!(gosterge.active_repairs, 0);
        assert_eq!(gosterge.today_sale_count, 0);
        assert!(gosterge.recent_activity.is_empty(), "yeni kurulumda işlem geçmişi boş olmalı");

        // Yalnızca kategori listesi hazır gelir; bu iş verisi değil, arayüz iskeletidir.
        assert_eq!(list_products(&connection, "").unwrap().len(), 0);
        assert!(!list_categories(&connection).unwrap().is_empty());
    }

    #[test]
    fn reset_clears_everything_and_returns_to_fresh_state() {
        let temp = std::env::temp_dir().join(format!("dukkan-reset-testi-{}", std::process::id()));
        std::fs::create_dir_all(&temp).unwrap();
        let mut connection = test_connection();

        // Veri üret: ürün, satış, tamir, gider
        let product_id = save_product(&mut connection, sample_product(5)).unwrap();
        sell(&mut connection, product_id, 2);
        save_expense(&mut connection, ExpenseInput {
            id: None, category: "Kira".into(), description: "Test".into(),
            amount: 1_000, expense_date: today(), payment_method: String::new(),
        }).unwrap();
        save_repair(&mut connection, RepairInput {
            id: None, customer_name: "Test".into(), customer_phone: String::new(),
            brand: "Samsung".into(), model: "A50".into(), imei: String::new(),
            problem: "Ekran".into(), status: "received".into(), received_at: today(),
            planned_delivery_at: String::new(), estimated_cost: 0, charged_amount: 0,
            deposit_amount: 0, notes: String::new(),
        }).unwrap();
        assert!(dashboard(&connection).unwrap().month_revenue > 0, "önce veri oluşmalı");

        reset_all_data(&mut connection, &temp).unwrap();

        // Sıfırlama sonrası her şey yeni kurulum gibi olmalı
        for tablo in ["products", "sales", "sale_items", "stock_movements", "repairs", "expenses", "audit_log"] {
            let adet: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {}", tablo), [], |row| row.get(0))
                .unwrap();
            assert_eq!(adet, 0, "sıfırlamadan sonra '{}' boş olmalı", tablo);
        }
        let gosterge = dashboard(&connection).unwrap();
        assert_eq!(gosterge.month_revenue, 0);
        assert_eq!(gosterge.stock_value, 0);
        assert!(!list_categories(&connection).unwrap().is_empty(), "kategoriler varsayılana dönmeli");

        // Güvenlik için yedek alınmış olmalı
        let yedekler: Vec<_> = std::fs::read_dir(&temp).unwrap().filter_map(|e| e.ok()).collect();
        assert!(!yedekler.is_empty(), "sıfırlamadan önce yedek alınmalı");

        std::fs::remove_dir_all(&temp).ok();
    }

    fn ornek_tamir(connection: &mut Connection) -> i64 {
        save_repair(connection, RepairInput {
            id: None, customer_name: "Ahmet".into(), customer_phone: "5320000000".into(),
            brand: "Samsung".into(), model: "A54".into(), imei: String::new(),
            problem: "Ekran kırık".into(), status: "received".into(), received_at: today(),
            planned_delivery_at: String::new(), estimated_cost: 50_000, charged_amount: 0,
            deposit_amount: 0, notes: String::new(),
        }).unwrap()
    }

    /// Durum güncellemesi tutarlara ASLA dokunmamalı; kullanıcının asıl şikayeti buydu.
    #[test]
    fn status_update_never_touches_money() {
        let mut connection = test_connection();
        let id = ornek_tamir(&mut connection);
        update_repair_charge(&mut connection, RepairChargeInput {
            repair_id: id, charged_amount: 300_000, deposit_amount: 10_000, note: String::new(),
        }).unwrap();

        for durum in ["diagnosis", "waiting_part", "in_progress", "ready"] {
            update_repair_status(&mut connection, RepairStatusInput {
                repair_id: id, status: durum.into(), note: format!("{} notu", durum),
            }).unwrap();
        }

        let detay = repair_detail(&connection, id).unwrap();
        assert_eq!(detay.repair.status, "ready");
        assert_eq!(detay.repair.charged_amount, 300_000, "durum değişince alınacak tutar bozulmamalı");
        assert_eq!(detay.repair.deposit_amount, 10_000, "kapora bozulmamalı");
        assert_eq!(detay.repair.estimated_cost, 50_000, "tahmini tutar bozulmamalı");
        assert_eq!(detay.repair.problem, "Ekran kırık", "sorun metni bozulmamalı");
    }

    #[test]
    fn repair_history_records_every_step() {
        let mut connection = test_connection();
        let id = ornek_tamir(&mut connection);
        update_repair_status(&mut connection, RepairStatusInput {
            repair_id: id, status: "waiting_part".into(), note: "Ekran siparişi verildi".into(),
        }).unwrap();
        add_repair_note(&mut connection, id, "Müşteri arandı, onay verdi".into()).unwrap();
        add_repair_part(&mut connection, RepairPartInput {
            repair_id: id, name: "Orijinal ekran".into(), cost: 150_000, note: String::new(),
        }).unwrap();

        let detay = repair_detail(&connection, id).unwrap();
        assert_eq!(detay.events.len(), 4, "kayıt + durum + not + parça = 4 olay");
        assert!(detay.events.iter().any(|e| e.note.contains("Ekran siparişi")));
        assert!(detay.events.iter().any(|e| e.note.contains("Müşteri arandı")));
        assert_eq!(detay.parts.len(), 1);
        assert_eq!(detay.parts_cost, 150_000);
    }

    /// Parça maliyeti kâra düşmeli: 300 TL alındı, 150 TL parça => 150 TL kâr.
    #[test]
    fn part_cost_reduces_repair_profit() {
        let mut connection = test_connection();
        let id = ornek_tamir(&mut connection);
        add_repair_part(&mut connection, RepairPartInput {
            repair_id: id, name: "Ekran".into(), cost: 150_000, note: String::new(),
        }).unwrap();
        update_repair_charge(&mut connection, RepairChargeInput {
            repair_id: id, charged_amount: 300_000, deposit_amount: 0, note: String::new(),
        }).unwrap();
        update_repair_status(&mut connection, RepairStatusInput {
            repair_id: id, status: "delivered".into(), note: String::new(),
        }).unwrap();

        let tarih = today();
        let rapor = report(&connection, &tarih, &tarih).unwrap();
        assert_eq!(rapor.repair_income, 300_000);
        assert_eq!(rapor.repair_parts_cost, 150_000);
        assert_eq!(rapor.gross_profit, 150_000, "parça maliyeti kârdan düşmeli");
        assert_eq!(rapor.net_profit, 150_000);
    }

    #[test]
    fn deleting_a_part_restores_profit() {
        let mut connection = test_connection();
        let id = ornek_tamir(&mut connection);
        let part_id = add_repair_part(&mut connection, RepairPartInput {
            repair_id: id, name: "Yanlış parça".into(), cost: 90_000, note: String::new(),
        }).unwrap();
        assert_eq!(repair_detail(&connection, id).unwrap().parts_cost, 90_000);

        delete_repair_part(&mut connection, part_id).unwrap();
        let detay = repair_detail(&connection, id).unwrap();
        assert_eq!(detay.parts_cost, 0);
        assert!(detay.events.iter().any(|e| e.note.contains("Parça kaldırıldı")));
    }

    #[test]
    fn migration_runs_twice_without_losing_data() {
        let mut connection = test_connection();
        save_product(&mut connection, sample_product(3)).unwrap();
        migrate(&connection).unwrap();
        migrate(&connection).unwrap();
        assert_eq!(list_products(&connection, "").unwrap().len(), 1);
    }
}
