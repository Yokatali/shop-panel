mod db;
mod error;
mod models;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::*;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::MutexGuard;
use tauri::{Manager, State};

fn locked<'a>(state: &'a State<'_, AppState>) -> AppResult<MutexGuard<'a, Connection>> {
    state
        .connection
        .lock()
        .map_err(|_| AppError::Validation("Veritabanı kilitlendi.".into()))
}

#[tauri::command]
fn get_dashboard(state: State<'_, AppState>) -> AppResult<DashboardData> {
    let connection = locked(&state)?;
    db::dashboard(&connection)
}

#[tauri::command]
fn get_products(state: State<'_, AppState>, search: Option<String>) -> AppResult<Vec<Product>> {
    let connection = locked(&state)?;
    db::list_products(&connection, search.as_deref().unwrap_or(""))
}

#[tauri::command]
fn upsert_product(state: State<'_, AppState>, input: ProductInput) -> AppResult<i64> {
    let mut connection = locked(&state)?;
    db::save_product(&mut connection, input)
}

#[tauri::command]
fn delete_product(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut connection = locked(&state)?;
    db::archive_product(&mut connection, id)
}

#[tauri::command]
fn get_categories(state: State<'_, AppState>) -> AppResult<Vec<Category>> {
    let connection = locked(&state)?;
    db::list_categories(&connection)
}

#[tauri::command]
fn upsert_category(state: State<'_, AppState>, input: CategoryInput) -> AppResult<i64> {
    let mut connection = locked(&state)?;
    db::save_category(&mut connection, input)
}

#[tauri::command]
fn delete_category(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut connection = locked(&state)?;
    db::archive_category(&mut connection, id)
}

#[tauri::command]
fn add_stock_movement(state: State<'_, AppState>, input: StockMovementInput) -> AppResult<MovementResult> {
    let mut connection = locked(&state)?;
    db::record_stock_movement(&mut connection, input)
}

#[tauri::command]
fn quick_movement(state: State<'_, AppState>, input: QuickMovementInput) -> AppResult<MovementResult> {
    let mut connection = locked(&state)?;
    db::quick_movement(&mut connection, input)
}

#[tauri::command]
fn get_sales(state: State<'_, AppState>, limit: Option<i64>) -> AppResult<Vec<Sale>> {
    let connection = locked(&state)?;
    db::list_sales(&connection, limit.unwrap_or(60))
}

#[tauri::command]
fn void_sale(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut connection = locked(&state)?;
    db::void_sale(&mut connection, id)
}

#[tauri::command]
fn get_repairs(state: State<'_, AppState>) -> AppResult<Vec<Repair>> {
    let connection = locked(&state)?;
    db::list_repairs(&connection)
}

#[tauri::command]
fn upsert_repair(state: State<'_, AppState>, input: RepairInput) -> AppResult<i64> {
    let mut connection = locked(&state)?;
    db::save_repair(&mut connection, input)
}

#[tauri::command]
fn delete_repair(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut connection = locked(&state)?;
    db::archive_repair(&mut connection, id)
}

#[tauri::command]
fn get_expenses(state: State<'_, AppState>) -> AppResult<Vec<Expense>> {
    let connection = locked(&state)?;
    db::list_expenses(&connection)
}

#[tauri::command]
fn add_expense(state: State<'_, AppState>, input: ExpenseInput) -> AppResult<i64> {
    let mut connection = locked(&state)?;
    db::save_expense(&mut connection, input)
}

#[tauri::command]
fn delete_expense(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut connection = locked(&state)?;
    db::archive_expense(&mut connection, id)
}

#[tauri::command]
fn get_report(state: State<'_, AppState>, start: String, end: String) -> AppResult<ReportData> {
    let connection = locked(&state)?;
    db::report(&connection, &start, &end)
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    let connection = locked(&state)?;
    db::load_settings(&connection)
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, input: Settings) -> AppResult<Settings> {
    let mut connection = locked(&state)?;
    db::save_settings(&mut connection, input)
}

#[tauri::command]
fn backup_database(state: State<'_, AppState>, destination: Option<String>) -> AppResult<BackupResult> {
    let data_dir = state.data_dir.clone();
    let connection = locked(&state)?;
    db::create_backup(&connection, &data_dir, destination.map(PathBuf::from))
}

/// Tüm iş verisini siler. Önce otomatik yedek alır, yedeğin yolunu döner.
#[tauri::command]
fn reset_all_data(state: State<'_, AppState>) -> AppResult<BackupResult> {
    let data_dir = state.data_dir.clone();
    let mut connection = locked(&state)?;
    db::reset_all_data(&mut connection, &data_dir)
}

#[tauri::command]
fn restore_database(state: State<'_, AppState>, source: String) -> AppResult<()> {
    let data_dir = state.data_dir.clone();
    let mut connection = locked(&state)?;
    db::restore_backup(&mut connection, &data_dir, &PathBuf::from(source))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Güncelleme denetimi elle yapılır (Ayarlar > Veri). İnternet yoksa
        // uygulama hiçbir şey fark etmeden çevrimdışı çalışmaya devam eder.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let connection = db::open_database(&data_dir)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            app.manage(AppState { connection: std::sync::Mutex::new(connection), data_dir });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            get_products, upsert_product, delete_product,
            get_categories, upsert_category, delete_category,
            add_stock_movement, quick_movement, get_sales, void_sale,
            get_repairs, upsert_repair, delete_repair,
            get_expenses, add_expense, delete_expense,
            get_report, get_settings, save_settings,
            backup_database, restore_database, reset_all_data
        ])
        .run(tauri::generate_context!())
        .expect("Uygulama başlatılamadı");
}
