//! Lance le client LoL officiel via le Riot Client, comme le raccourci du bureau.
//! Rien d'autre : pas de connexion automatique, pas d'action en jeu.

#[cfg(windows)]
fn riot_client_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    let installs = std::fs::read_to_string(r"C:\ProgramData\Riot Games\RiotClientInstalls.json").ok();
    if let Some(v) = installs.and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()) {
        for key in ["rc_default", "rc_live"] {
            if let Some(p) = v.get(key).and_then(|p| p.as_str()) {
                let p = PathBuf::from(p);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    ["C", "D", "E", "F"]
        .iter()
        .map(|d| PathBuf::from(format!(r"{d}:\Riot Games\Riot Client\RiotClientServices.exe")))
        .find(|p| p.exists())
}

#[cfg(windows)]
fn league_running() -> bool {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq LeagueClient.exe", "/NH"])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("LeagueClient.exe"))
        .unwrap_or(false)
}

/// La fenêtre du client officiel (LeagueClientUxRender) est-elle ouverte ?
#[cfg(windows)]
pub fn ux_running() -> bool {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq LeagueClientUxRender.exe", "/NH"])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("LeagueClientUxRender.exe"))
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn ux_running() -> bool {
    true
}

/// Mémoire utilisée par les processus du client Riot / LoL, en Mo, par nom de processus.
#[cfg(windows)]
pub fn client_memory() -> Vec<(String, u64)> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    let mut totals: Vec<(String, u64)> = Vec::new();
    for line in out.lines() {
        let cols: Vec<&str> = line.split("\",\"").map(|c| c.trim_matches('"')).collect();
        if cols.len() < 5 {
            continue;
        }
        let name = cols[0].to_string();
        let lower = name.to_lowercase();
        if !(lower.starts_with("leagueclient") || lower.starts_with("riotclient") || lower.starts_with("league of legends")) {
            continue;
        }
        let kb: u64 = cols[4].chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
        match totals.iter_mut().find(|(n, _)| *n == name) {
            Some((_, v)) => *v += kb / 1024,
            None => totals.push((name, kb / 1024)),
        }
    }
    totals
}

#[cfg(not(windows))]
pub fn client_memory() -> Vec<(String, u64)> {
    Vec::new()
}

/// "started", "running" (déjà ouvert) ou une erreur lisible.
#[cfg(windows)]
pub fn launch_league() -> Result<&'static str, String> {
    if league_running() {
        return Ok("running");
    }
    let exe = riot_client_path().ok_or("Riot Client introuvable sur ce PC.")?;
    std::process::Command::new(exe)
        .args(["--launch-product=league_of_legends", "--launch-patchline=live"])
        .spawn()
        .map_err(|e| format!("Impossible de lancer le Riot Client : {e}"))?;
    Ok("started")
}

#[cfg(not(windows))]
pub fn launch_league() -> Result<&'static str, String> {
    Err("Lancement automatique disponible sur Windows uniquement.".into())
}
