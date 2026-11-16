use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

const SERVICE: &str = "com.nightpet";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub llm_url: String,
    pub llm_model: String,
    pub mcp_url: String,
    pub mcp_protocol_version: String,
    pub permitted_tools: Vec<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            llm_url: "http://127.0.0.1:11434/v1/chat/completions".into(),
            llm_model: "qwen3:4b".into(),
            mcp_url: "https://YOUR_MISSION_EDGESIGHT_URL.com/mcp".into(),
            mcp_protocol_version: "2025-06-18".into(),
            permitted_tools: vec![],
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct SettingsView {
    #[serde(flatten)]
    pub config: AppConfig,
    pub has_llm_key: bool,
    pub has_mcp_token: bool,
}

#[derive(Deserialize)]
pub struct SettingsUpdate {
    #[serde(flatten)]
    pub config: AppConfig,
    #[serde(default)]
    pub new_llm_key: String,
    #[serde(default)]
    pub new_mcp_token: String,
    #[serde(default)]
    pub clear_llm_key: bool,
    #[serde(default)]
    pub clear_mcp_token: bool,
}

fn path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    let file = path(app)?;
    if !file.exists() {
        return Ok(AppConfig::default());
    }
    let text = fs::read_to_string(file).map_err(|e| format!("Cannot read settings: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("Invalid saved settings: {e}"))
}

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, name).map_err(|e| format!("macOS Keychain error: {e}"))
}

pub fn secret(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("macOS Keychain access failed: {e}")),
    }
}

fn update_secret(name: &str, new_value: &str, clear: bool) -> Result<(), String> {
    let key = entry(name)?;
    if clear {
        match key.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Could not clear key in Keychain: {e}")),
        }
    } else if new_value.is_empty() {
        Ok(())
    } else {
        key.set_password(new_value).map_err(|e| format!("Cannot save key in Keychain: {e}"))
    }
}

pub fn settings(app: &tauri::AppHandle) -> Result<SettingsView, String> {
    Ok(SettingsView {
        config: load(app)?,
        has_llm_key: secret("llm-api-key")?.is_some(),
        has_mcp_token: secret("edgesight-mcp-token")?.is_some(),
    })
}

pub fn save(app: &tauri::AppHandle, mut update: SettingsUpdate) -> Result<SettingsView, String> {
    validate_url(&update.config.llm_url, "Qwen")?;
    validate_url(&update.config.mcp_url, "MCP")?;
    if update.config.llm_model.trim().is_empty() || update.config.llm_model.len() > 128 {
        return Err("Enter the exact local Qwen model name (max 128 characters).".into());
    }
    if !["2025-03-26", "2025-06-18", "2025-11-25"]
        .contains(&update.config.mcp_protocol_version.as_str())
    {
        return Err("Select a supported MCP protocol version.".into());
    }
    if update.config.permitted_tools.len() > 50 || update.config.permitted_tools.iter().any(|n| n.len() > 128) {
        return Err("Too many or invalid tool names.".into());
    }
    // A new endpoint is a different trust boundary; approvals never carry over.
    let previous = load(app)?;
    if previous.mcp_url != update.config.mcp_url {
        update.config.permitted_tools.clear();
    }
    let file = path(app)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Keep keys OUT of the JSON settings file and return only presence flags.
    update_secret("llm-api-key", &update.new_llm_key, update.clear_llm_key)?;
    update_secret("edgesight-mcp-token", &update.new_mcp_token, update.clear_mcp_token)?;
    let json = serde_json::to_vec_pretty(&update.config).map_err(|e| e.to_string())?;
    fs::write(file, json).map_err(|e| format!("Could not save settings: {e}"))?;
    settings(app)
}

pub fn validate_url(input: &str, label: &str) -> Result<(), String> {
    let url = url::Url::parse(input.trim()).map_err(|e| format!("Invalid {label} URL: {e}"))?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(format!("{label}: do not include credentials in the URL."));
    }
    if url.fragment().is_some() || url.host_str().is_none() {
        return Err(format!("{label}: URL must have a host and no fragment."));
    }
    match url.scheme() {
        "https" => Ok(()),
        "http" => {
            let host = url.host_str().unwrap_or_default().to_lowercase();
            let private_ipv4 = host.parse::<std::net::Ipv4Addr>()
                .map(|ip| ip.is_private() || ip.is_loopback() || ip.is_link_local())
                .unwrap_or(false);
            let private_ipv6 = host.parse::<std::net::Ipv6Addr>()
                .map(|ip| ip.is_loopback() || ip.is_unique_local())
                .unwrap_or(false);
            if host == "localhost" || host.ends_with(".local") || private_ipv4 || private_ipv6 {
                Ok(())
            } else {
                Err(format!("{label}: HTTP is allowed only for private/local endpoints; use HTTPS otherwise."))
            }
        }
        _ => Err(format!("{label}: only HTTP or HTTPS URLs are permitted.")),
    }
}
