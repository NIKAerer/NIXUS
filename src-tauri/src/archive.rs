//! Archive locale des parties classées : de simples fichiers JSON dans le
//! dossier de données de NIXUS (%APPDATA%\com.nika.nexus\archive sur Windows).

use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const KINDS: [&str; 4] = ["game", "timeline", "index", "debug"];

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn file(root: &PathBuf, kind: &str, id: &str) -> Result<PathBuf, String> {
    if !KINDS.contains(&kind) || !valid_id(id) {
        return Err("Entrée d'archive invalide".into());
    }
    Ok(root.join("archive").join(kind).join(format!("{id}.json")))
}

pub fn put(root: &PathBuf, kind: &str, id: &str, data: &Value) -> Result<(), String> {
    let path = file(root, kind, id)?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    // Écriture dans un fichier temporaire puis renommage : pas de fichier à moitié écrit.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(data).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn get(root: &PathBuf, kind: &str, id: &str) -> Result<Option<Value>, String> {
    let path = file(root, kind, id)?;
    match fs::read(&path) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
        Err(_) => Ok(None),
    }
}

pub fn list(root: &PathBuf, kind: &str) -> Result<Vec<String>, String> {
    file(root, kind, "x")?;
    let dir = root.join("archive").join(kind);
    let Ok(entries) = fs::read_dir(dir) else { return Ok(vec![]) };
    Ok(entries
        .filter_map(|e| e.ok())
        .filter_map(|e| e.file_name().to_str().and_then(|n| n.strip_suffix(".json")).map(String::from))
        .collect())
}

/// Sortes d'entrées sauvegardées (les captures de débogage restent sur place).
const SAVED: [&str; 3] = ["game", "timeline", "index"];

/// Taille de l'archive (octets, hors débogage) et date de la dernière écriture de l'index (ms).
pub fn stats(root: &PathBuf) -> (u64, u64) {
    let mut bytes = 0u64;
    for kind in SAVED {
        if let Ok(entries) = fs::read_dir(root.join("archive").join(kind)) {
            for e in entries.filter_map(|e| e.ok()) {
                bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    let last = fs::metadata(root.join("archive").join("index").join("ranked.json"))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    (bytes, last)
}

/// Un seul fichier JSON : { "format": "nixus-archive", "version": 1, "items": { kind: { id: data } } }.
pub fn export(root: &PathBuf) -> Result<Value, String> {
    let mut items = serde_json::Map::new();
    for kind in SAVED {
        let mut m = serde_json::Map::new();
        for id in list(root, kind)? {
            if let Some(v) = get(root, kind, &id)? {
                m.insert(id, v);
            }
        }
        items.insert(kind.to_string(), Value::Object(m));
    }
    Ok(serde_json::json!({ "format": "nixus-archive", "version": 1, "items": items }))
}

/// Ajoute les entrées d'une sauvegarde à l'archive (rien n'est supprimé). Renvoie le nombre d'entrées écrites.
pub fn import(root: &PathBuf, backup: &Value) -> Result<usize, String> {
    if backup.get("format").and_then(|f| f.as_str()) != Some("nixus-archive") {
        return Err("Ce fichier n'est pas une sauvegarde NIXUS.".into());
    }
    let items = backup.get("items").and_then(|i| i.as_object()).ok_or("Sauvegarde vide.")?;
    let mut n = 0;
    for kind in SAVED {
        let Some(map) = items.get(kind).and_then(|m| m.as_object()) else { continue };
        for (id, data) in map {
            if valid_id(id) {
                put(root, kind, id, data)?;
                n += 1;
            }
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_tricks() {
        let root = std::env::temp_dir().join("nixus-test-archive");
        assert!(file(&root, "game", "../x").is_err());
        assert!(file(&root, "secrets", "1").is_err());
        assert!(file(&root, "game", "EUW1_123").is_ok());
    }

    #[test]
    fn roundtrip() {
        let root = std::env::temp_dir().join(format!("nixus-test-{}", std::process::id()));
        put(&root, "game", "42", &serde_json::json!({"a": 1})).unwrap();
        assert_eq!(get(&root, "game", "42").unwrap().unwrap()["a"], 1);
        assert_eq!(list(&root, "game").unwrap(), vec!["42".to_string()]);
        let backup = export(&root).unwrap();
        let other = std::env::temp_dir().join(format!("nixus-test-b-{}", std::process::id()));
        assert_eq!(import(&other, &backup).unwrap(), 1);
        assert_eq!(get(&other, "game", "42").unwrap().unwrap()["a"], 1);
        assert!(stats(&other).0 > 0);
        let _ = fs::remove_dir_all(other);
        let _ = fs::remove_dir_all(root);
    }
}
