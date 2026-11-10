//! Accès à l'API locale du client League of Legends (LCU).
//!
//! Le client Riot expose une API HTTPS sur 127.0.0.1, protégée par un mot de
//! passe généré à chaque lancement. On le récupère dans le `lockfile` du
//! client, ou à défaut dans la ligne de commande de `LeagueClientUx.exe`.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Clone, Debug, PartialEq)]
pub struct Credentials {
    pub port: u16,
    pub password: String,
}

impl Credentials {
    fn auth_header(&self) -> String {
        format!("Basic {}", STANDARD.encode(format!("riot:{}", self.password)))
    }
}

#[derive(Serialize)]
pub struct Status {
    pub connected: bool,
    pub port: Option<u16>,
}

pub struct Lcu {
    http: reqwest::Client,
    creds: Mutex<Option<Credentials>>,
}

impl Lcu {
    pub fn new() -> Self {
        // Le certificat du client est auto-signé par Riot. On ne parle qu'à
        // 127.0.0.1, donc l'accepter ne nous expose pas au réseau.
        let http = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("client HTTP");
        Self { http, creds: Mutex::new(None) }
    }

    fn credentials(&self) -> Option<Credentials> {
        let mut cached = self.creds.lock().unwrap();
        if cached.is_none() {
            *cached = find_credentials();
        }
        cached.clone()
    }

    fn forget(&self) {
        *self.creds.lock().unwrap() = None;
    }

    pub fn status(&self) -> Status {
        // On relit à chaque fois : le client a pu être relancé avec un autre port.
        self.forget();
        let creds = self.credentials();
        Status { connected: creds.is_some(), port: creds.map(|c| c.port) }
    }

    pub async fn request(&self, method: &str, path: &str, body: Option<Value>) -> Result<Value, String> {
        if !path.starts_with('/') || path.contains("://") {
            return Err("Chemin invalide".into());
        }
        let creds = self.credentials().ok_or("Client League of Legends introuvable")?;
        let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
            .map_err(|_| "Méthode HTTP invalide".to_string())?;
        let url = format!("https://127.0.0.1:{}{}", creds.port, path);

        let mut req = self
            .http
            .request(method, url)
            .header("Authorization", creds.auth_header())
            .header("Accept", "application/json");
        if let Some(body) = body {
            req = req.json(&body);
        }

        let res = match req.send().await {
            Ok(res) => res,
            Err(e) => {
                // Client fermé ou relancé : on recherchera les identifiants au prochain appel.
                self.forget();
                return Err(format!("Connexion au client impossible : {e}"));
            }
        };

        let status = res.status();
        let text = res.text().await.map_err(|e| e.to_string())?;
        let value = if text.trim().is_empty() {
            Value::Null
        } else {
            serde_json::from_str(&text).unwrap_or(Value::String(text))
        };
        if status.is_success() {
            Ok(value)
        } else {
            let msg = value.get("message").and_then(Value::as_str).unwrap_or("").to_string();
            Err(format!("{} {}", status.as_u16(), msg).trim().to_string())
        }
    }
}

/// `LeagueClient:pid:port:password:https`
pub fn parse_lockfile(content: &str) -> Option<Credentials> {
    let parts: Vec<&str> = content.trim().split(':').collect();
    if parts.len() < 5 {
        return None;
    }
    Some(Credentials { port: parts[2].parse().ok()?, password: parts[3].to_string() })
}

/// Lit `--app-port=…` et `--remoting-auth-token=…` dans une ligne de commande.
pub fn parse_command_line(cmd: &str) -> Option<Credentials> {
    let arg = |name: &str| {
        let key = format!("--{name}=");
        let start = cmd.find(&key)? + key.len();
        let rest = &cmd[start..];
        let end = rest.find(|c: char| c == '"' || c.is_whitespace()).unwrap_or(rest.len());
        Some(rest[..end].to_string())
    };
    Some(Credentials { port: arg("app-port")?.parse().ok()?, password: arg("remoting-auth-token")? })
}

fn lockfile_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(p) = std::env::var("NIXUS_LOCKFILE").or_else(|_| std::env::var("NEXUS_LOCKFILE")) {
        paths.push(PathBuf::from(p));
    }
    for drive in ["C", "D", "E"] {
        paths.push(PathBuf::from(format!(r"{drive}:\Riot Games\League of Legends\lockfile")));
    }
    paths.push(PathBuf::from("/Applications/League of Legends.app/Contents/LoL/lockfile"));
    paths
}

fn find_credentials() -> Option<Credentials> {
    lockfile_candidates()
        .iter()
        .find_map(|p| std::fs::read_to_string(p).ok().and_then(|c| parse_lockfile(&c)))
        .or_else(credentials_from_process)
}

#[cfg(windows)]
fn credentials_from_process() -> Option<Credentials> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\").CommandLine",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    parse_command_line(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(not(windows))]
fn credentials_from_process() -> Option<Credentials> {
    let out = std::process::Command::new("ps").args(["-A", "-o", "args"]).output().ok()?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| l.contains("LeagueClientUx"))
        .find_map(parse_command_line)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_le_lockfile() {
        let c = parse_lockfile("LeagueClient:12345:54321:abcDEF_12:https").unwrap();
        assert_eq!(c, Credentials { port: 54321, password: "abcDEF_12".into() });
        assert!(parse_lockfile("vide").is_none());
    }

    #[test]
    fn lit_la_ligne_de_commande() {
        let cmd = r#""C:/Riot Games/League of Legends/LeagueClientUx.exe" "--remoting-auth-token=tok3n" "--app-port=61234" --other"#;
        let c = parse_command_line(cmd).unwrap();
        assert_eq!(c, Credentials { port: 61234, password: "tok3n".into() });
    }

    #[test]
    fn en_tete_basic() {
        let c = Credentials { port: 1, password: "pw".into() };
        assert_eq!(c.auth_header(), "Basic cmlvdDpwdw==");
    }
}
