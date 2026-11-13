//! Accès à l'API officielle de Riot (account-v1, match-v5) avec la clé que l'utilisateur colle dans les Paramètres.
//! Les appels passent par ici (pas de CORS côté Riot) et sont espacés pour rester sous les limites d'une clé perso.

use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Clé de développement : 20 requêtes/s et 100 toutes les 2 minutes. Une toutes les 1,25 s tient les deux.
const SPACING: Duration = Duration::from_millis(1250);
const REGIONS: [&str; 4] = ["europe", "americas", "asia", "sea"];

pub struct Riot {
    client: reqwest::Client,
    last: Mutex<Option<Instant>>,
}

impl Riot {
    pub fn new() -> Self {
        Self { client: reqwest::Client::builder()
                // Sans User-Agent, l'API Riot répond 403 alors que la clé est bonne.
                .user_agent(concat!("NIXUS/", env!("CARGO_PKG_VERSION")))
                .timeout(Duration::from_secs(20)).build().expect("client http"), last: Mutex::new(None) }
    }

    pub async fn get(&self, region: &str, path: &str, key: &str) -> Result<Value, String> {
        if !REGIONS.contains(&region) {
            return Err(format!("Région inconnue : {region}"));
        }
        if !path.starts_with("/riot/account/v1/") && !path.starts_with("/lol/match/v5/") {
            return Err("Chemin non autorisé".into());
        }
        let key = key.trim();
        if key.is_empty() {
            return Err("NO_KEY".into());
        }
        let url = format!("https://{region}.api.riotgames.com{path}");
        for _ in 0..4 {
            {
                // Un seul appel à la fois, espacés de SPACING.
                let mut last = self.last.lock().await;
                if let Some(t) = *last {
                    let wait = SPACING.saturating_sub(t.elapsed());
                    if !wait.is_zero() {
                        tokio::time::sleep(wait).await;
                    }
                }
                *last = Some(Instant::now());
            }
            let res = self.client.get(&url).header("X-Riot-Token", key).send().await.map_err(|e| format!("NETWORK: {e}"))?;
            let status = res.status().as_u16();
            if status == 429 {
                let secs = res.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| v.parse::<u64>().ok()).unwrap_or(10);
                tokio::time::sleep(Duration::from_secs(secs.min(120))).await;
                continue;
            }
            if !(200..300).contains(&status) {
                // Riot renvoie {"status":{"message":"..."}} : on le garde pour un message clair.
                let body = res.text().await.unwrap_or_default();
                let msg = serde_json::from_str::<Value>(&body).ok().and_then(|v| v["status"]["message"].as_str().map(String::from)).unwrap_or_else(|| body.chars().take(160).collect());
                return Err(format!("HTTP {status} {region}{} : {msg}", path.split('?').next().unwrap_or(path)));
            }
            return res.json::<Value>().await.map_err(|e| e.to_string());
        }
        Err("HTTP 429".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn refuse_les_chemins_et_regions_inconnus() {
        let r = Riot::new();
        assert!(r.get("europe", "/lol/summoner/v4/x", "k").await.is_err());
        assert!(r.get("mars", "/lol/match/v5/matches/EUW1_1", "k").await.is_err());
        assert_eq!(r.get("europe", "/lol/match/v5/matches/EUW1_1", " ").await.unwrap_err(), "NO_KEY");
    }
}
