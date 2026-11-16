mod archive;
mod lcu;
mod riot;
mod launch;
mod usage;

use lcu::{Lcu, Status};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
fn lcu_status(lcu: State<'_, Lcu>) -> Status {
    lcu.status()
}

#[tauri::command]
async fn lcu_request(
    lcu: State<'_, Lcu>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    lcu.request(&method, &path, body).await
}

fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn archive_put(app: AppHandle, kind: String, id: String, data: Value) -> Result<(), String> {
    archive::put(&data_dir(&app)?, &kind, &id, &data)
}

#[tauri::command]
fn archive_get(app: AppHandle, kind: String, id: String) -> Result<Option<Value>, String> {
    archive::get(&data_dir(&app)?, &kind, &id)
}

#[tauri::command]
fn archive_list(app: AppHandle, kind: String) -> Result<Vec<String>, String> {
    archive::list(&data_dir(&app)?, &kind)
}

#[tauri::command]
async fn riot_get(riot: State<'_, riot::Riot>, region: String, path: String, key: String) -> Result<Value, String> {
    riot.get(&region, &path, &key).await
}

#[tauri::command]
fn client_memory() -> Vec<(String, u64)> {
    launch::client_memory()
}

/// Mémoire (Mo) et processeur (% du total) pris par NIXUS lui-même, fenêtre WebView2 comprise.
#[tauri::command]
fn nixus_usage(u: State<'_, usage::Usage>) -> (u64, f32) {
    u.measure()
}

#[derive(serde::Serialize)]
struct ArchiveStats {
    bytes: u64,
    last: u64,
}

#[tauri::command]
fn archive_stats(app: AppHandle) -> Result<ArchiveStats, String> {
    let (bytes, last) = archive::stats(&data_dir(&app)?);
    Ok(ArchiveStats { bytes, last })
}

/// Écrit la sauvegarde dans Documents et renvoie son chemin.
#[tauri::command]
fn archive_backup(app: AppHandle) -> Result<String, String> {
    let data = archive::export(&data_dir(&app)?)?;
    let dir = app.path().document_dir().map_err(|e| e.to_string())?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let path = dir.join(format!("NIXUS-archive-{}.json", civil_date(secs)));
    std::fs::write(&path, serde_json::to_vec(&data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn archive_restore(app: AppHandle, content: String) -> Result<usize, String> {
    let v: Value = serde_json::from_str(&content).map_err(|_| "Fichier illisible.".to_string())?;
    archive::import(&data_dir(&app)?, &v)
}

/// AAAA-MM-JJ à partir de secondes Unix (UTC), sans dépendance de date.
fn civil_date(secs: u64) -> String {
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

#[tauri::command]
fn ux_running() -> bool {
    launch::ux_running()
}

#[tauri::command]
fn launch_league() -> Result<String, String> {
    launch::launch_league().map(String::from)
}

/// Première ouverture : reprend l'archive du NIXUS d'origine (com.nika.nexus) si celle-ci est vide ici.
/// Copie seulement : l'archive d'origine n'est jamais modifiée.
fn adopt_original_archive(app: &AppHandle) {
    let Ok(mine) = data_dir(app) else { return };
    let target = mine.join("archive");
    if target.exists() {
        return;
    }
    let Some(source) = mine.parent().map(|p| p.join("com.nika.nexus").join("archive")) else { return };
    for kind in ["game", "timeline", "index"] {
        let Ok(entries) = std::fs::read_dir(source.join(kind)) else { continue };
        let dest = target.join(kind);
        if std::fs::create_dir_all(&dest).is_err() {
            return;
        }
        for e in entries.filter_map(|e| e.ok()) {
            let _ = std::fs::copy(e.path(), dest.join(e.file_name()));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(usage::Usage::new())
        .manage(Lcu::new())
        .manage(riot::Riot::new())
        .setup(|app| {
            adopt_original_archive(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![lcu_status, lcu_request, archive_put, archive_get, archive_list, riot_get, launch_league, ux_running, client_memory, nixus_usage, archive_stats, archive_backup, archive_restore])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de NIXUS");
}
