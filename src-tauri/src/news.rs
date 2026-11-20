//! Notes de patch : NIXUS lit les pages officielles de leagueoflegends.com (en français) et les découpe
//! côté interface. Aucun résumé automatique : le texte affiché est celui de Riot.

use std::time::Duration;

const SITE: &str = "https://www.leagueoflegends.com";
/// Une page de notes fait ~500 Ko ; au-delà, c'est autre chose.
const MAX_BYTES: usize = 4 * 1024 * 1024;

pub struct News {
    client: reqwest::Client,
}

/// Seules les pages d'actualité en français sont lisibles, sans paramètres ni remontée de dossier.
pub fn valid_path(path: &str) -> bool {
    path.starts_with("/fr-fr/news/")
        && !path.contains("..")
        && path.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '/')
}

impl News {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent(concat!("NIXUS/", env!("CARGO_PKG_VERSION")))
                .timeout(Duration::from_secs(20))
                .build()
                .expect("client http"),
        }
    }

    pub async fn page(&self, path: &str) -> Result<String, String> {
        if !valid_path(path) {
            return Err("Page non autorisée".into());
        }
        let res = self.client.get(format!("{SITE}{path}")).send().await.map_err(|e| format!("NETWORK: {e}"))?;
        let status = res.status().as_u16();
        if !(200..300).contains(&status) {
            return Err(format!("HTTP {status}"));
        }
        let body = res.text().await.map_err(|e| e.to_string())?;
        if body.len() > MAX_BYTES {
            return Err("Page trop grande".into());
        }
        Ok(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chemins() {
        assert!(valid_path("/fr-fr/news/tags/patch-notes/"));
        assert!(valid_path("/fr-fr/news/game-updates/league-of-legends-patch-26-23-notes"));
        assert!(!valid_path("/en-us/news/tags/patch-notes/"));
        assert!(!valid_path("/fr-fr/news/../account"));
        assert!(!valid_path("/fr-fr/news/x?y=1"));
        assert!(!valid_path("//evil.com/fr-fr/news/"));
    }
}
