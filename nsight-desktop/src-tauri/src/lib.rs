mod config;
mod mcp;
mod qwen;

use reqwest::Client;
use std::time::Duration;
use tauri::AppHandle;

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(85))
        .connect_timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("nSIght/0.2.0")
        .build().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<config::SettingsView, String> {
    config::settings(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, update: config::SettingsUpdate) -> Result<config::SettingsView, String> {
    config::save(&app, update)
}

#[tauri::command]
async fn test_qwen(app: AppHandle) -> Result<String, String> {
    let cfg = config::load(&app)?;
    qwen::test_llm(http_client()?, &cfg).await
}

#[tauri::command]
async fn test_mcp(app: AppHandle) -> Result<String, String> {
    let cfg = config::load(&app)?;
    let mut mcp = mcp::McpClient::connect(http_client()?, &cfg).await?;
    let tools = mcp.list_tools().await?;
    Ok(format!("EdgeSight MCP connected · {} tools discovered", tools.len()))
}

#[tauri::command]
async fn discover_mcp_tools(app: AppHandle) -> Result<Vec<mcp::DiscoveredTool>, String> {
    let cfg = config::load(&app)?;
    let mut mcp = mcp::McpClient::connect(http_client()?, &cfg).await?;
    Ok(mcp::listed(mcp.list_tools().await?))
}

#[tauri::command]
async fn send_chat(app: AppHandle, prompt: String, history: Vec<qwen::ChatTurn>) -> Result<qwen::ChatReply, String> {
    let cfg = config::load(&app)?;
    qwen::answer(http_client()?, &cfg, prompt, history).await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_settings, save_settings, test_qwen, test_mcp,
            discover_mcp_tools, send_chat, quit_app
        ])
        .run(tauri::generate_context!())
        .expect("Error starting nSIght");
}
