use crate::config::{self, AppConfig};
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "inputSchema", default = "object_schema")]
    pub input_schema: Value,
    #[serde(default)]
    pub annotations: Value,
}

fn object_schema() -> Value { json!({"type":"object","properties":{}}) }

#[derive(Clone, Debug, Serialize)]
pub struct DiscoveredTool {
    #[serde(flatten)]
    pub tool: McpTool,
    pub eligible_for_read_only_allowlist: bool,
}

pub struct McpClient {
    http: Client,
    url: String,
    token: Option<String>,
    version: String,
    session_id: Option<String>,
    next_id: u64,
}

impl McpClient {
    pub async fn connect(http: Client, cfg: &AppConfig) -> Result<Self, String> {
        config::validate_url(&cfg.mcp_url, "MCP")?;
        let token = config::secret("edgesight-mcp-token")?;
        let mut client = Self {
            http, url: cfg.mcp_url.clone(), token,
            version: cfg.mcp_protocol_version.clone(),
            session_id: None, next_id: 1,
        };
        let result = client.rpc("initialize", json!({
            "protocolVersion": cfg.mcp_protocol_version,
            "capabilities": {},
            "clientInfo": { "name": "nsight-macos", "version": "0.2.0" }
        })).await?;
        if let Some(v) = result.get("protocolVersion").and_then(Value::as_str) {
            client.version = v.to_string();
        }
        client.notification("notifications/initialized", json!({})).await?;
        Ok(client)
    }

    fn request(&self, body: Value) -> reqwest::RequestBuilder {
        let mut request = self.http.post(&self.url)
            .header(header::ACCEPT, "application/json, text/event-stream")
            .header(header::CONTENT_TYPE, "application/json")
            .header("MCP-Protocol-Version", self.version.as_str())
            .json(&body);
        if let Some(token) = self.token.as_ref().filter(|t| !t.trim().is_empty()) {
            request = request.bearer_auth(token);
        }
        if let Some(id) = &self.session_id {
            request = request.header("Mcp-Session-Id", id);
        }
        request
    }

    async fn notification(&mut self, method: &str, params: Value) -> Result<(), String> {
        let body = json!({"jsonrpc":"2.0","method":method,"params":params});
        let resp = self.request(body).send().await.map_err(|e| format!("MCP notification: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("MCP notification failed: HTTP {}", resp.status()));
        }
        Ok(())
    }

    pub async fn rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let body = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        let mut resp = self.request(body).send().await.map_err(|e| format!("MCP {method}: {e}"))?;
        if let Some(v) = resp.headers().get("Mcp-Session-Id") {
            self.session_id = Some(v.to_str().map_err(|_| "Invalid MCP session header".to_string())?.to_string());
        }
        if !resp.status().is_success() {
            let status = resp.status();
            let msg = resp.text().await.unwrap_or_default();
            return Err(format!("MCP {method} HTTP {status}: {}", crop(&msg, 350)));
        }
        let is_sse = resp.headers().get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()).unwrap_or("").starts_with("text/event-stream");
        if !is_sse {
            let value: Value = resp.json().await.map_err(|e| format!("Invalid MCP JSON: {e}"))?;
            return extract(value, id);
        }
        // Streamable HTTP may return the final JSON-RPC response as an SSE event.
        // Process incrementally; do not wait for the server to close a long-lived stream.
        let mut pending = String::new();
        let mut total = 0_usize;
        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("MCP SSE read: {e}"))? {
            total += chunk.len();
            if total > 8_000_000 { return Err("MCP response exceeded 8 MB".into()); }
            pending.push_str(&String::from_utf8_lossy(&chunk));
            pending = pending.replace("\r\n", "\n");
            while let Some(idx) = pending.find("\n\n") {
                let event = pending[..idx].to_owned();
                pending.drain(..idx + 2);
                let data = event.lines().filter_map(|line| line.strip_prefix("data:"))
                    .map(str::trim_start).collect::<Vec<_>>().join("\n");
                if data.is_empty() { continue; }
                if let Ok(v) = serde_json::from_str::<Value>(&data) {
                    if v.get("id") == Some(&json!(id)) { return extract(v, id); }
                }
            }
        }
        Err(format!("MCP {method} SSE ended without a matching response"))
    }

    pub async fn list_tools(&mut self) -> Result<Vec<McpTool>, String> {
        let mut result = Vec::new();
        let mut cursor: Option<String> = None;
        for _ in 0..8 {
            let args = match &cursor { Some(c) => json!({"cursor": c}), None => json!({}) };
            let data = self.rpc("tools/list", args).await?;
            let raw = data.get("tools").cloned().unwrap_or(json!([]));
            let tools: Vec<McpTool> = serde_json::from_value(raw)
                .map_err(|e| format!("MCP tools/list schema: {e}"))?;
            result.extend(tools);
            if result.len() >= 100 { result.truncate(100); break; }
            cursor = data.get("nextCursor").and_then(Value::as_str).map(str::to_string);
            if cursor.is_none() { break; }
        }
        Ok(result)
    }

    pub async fn call_tool(&mut self, name: &str, arguments: Value) -> Result<Value, String> {
        let result = self.rpc("tools/call", json!({"name": name, "arguments": arguments})).await?;
        Ok(result)
    }
}

fn crop(s: &str, max: usize) -> String {
    let mut text = s.chars().take(max).collect::<String>();
    if s.chars().count() > max { text.push('…'); }
    text
}

fn extract(reply: Value, expected_id: u64) -> Result<Value, String> {
    if reply.get("id") != Some(&json!(expected_id)) {
        return Err("MCP replied with an unexpected JSON-RPC ID".into());
    }
    if let Some(err) = reply.get("error") {
        return Err(format!("MCP error: {}", crop(&err.to_string(), 600)));
    }
    reply.get("result").cloned().ok_or_else(|| "MCP response missing result".to_string())
}

// Conservative first-pass policy; ONLY names on the user's allowlist can be called.
// Annotations are advisory, never proof. Evaluate real tools before enabling them.
pub fn eligible(tool: &McpTool) -> bool {
    let lower = tool.name.to_ascii_lowercase();
    let sections = lower.split(|c: char| !c.is_ascii_alphanumeric()).collect::<Vec<_>>();
    let deny = ["delete", "remove", "set", "write", "create", "update", "edit", "patch", "run", "exec", "execute", "command", "shell", "deploy", "restart", "stop", "start", "trigger", "approve", "deny", "send", "publish", "apply", "install", "reboot", "terminate", "assign", "configure", "upload", "mutate", "control", "reset", "clear"];
    if sections.iter().any(|part| deny.contains(part)) { return false; }
    if tool.annotations.get("readOnlyHint").and_then(Value::as_bool) == Some(false) { return false; }
    let props = tool.input_schema.get("properties").and_then(Value::as_object);
    if props.map(|p| p.keys().any(|k| ["command", "shell", "sql", "script", "code", "mutation"].contains(&k.to_ascii_lowercase().as_str()))).unwrap_or(false) {
        return false;
    }
    if tool.annotations.get("readOnlyHint").and_then(Value::as_bool) == Some(true) { return true; }
    // Without explicit server annotations allow only recognizable retrieval names.
    ["get", "list", "read", "fetch", "inspect", "describe", "status", "health", "search", "find", "lookup", "summarize", "query", "diagnostic", "diagnostics", "metrics"].iter()
        .any(|prefix| sections.iter().any(|part| part == prefix))
}

pub fn listed(tools: Vec<McpTool>) -> Vec<DiscoveredTool> {
    tools.into_iter().map(|tool| DiscoveredTool {
        eligible_for_read_only_allowlist: eligible(&tool), tool,
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tool(name: &str) -> McpTool {
        McpTool { name: name.into(), description: "".into(), input_schema: object_schema(), annotations: json!({}) }
    }
    #[test]
    fn blocks_write_tools() {
        assert!(eligible(&tool("get_mission_status")));
        assert!(eligible(&tool("edge_list_missions")));
        assert!(!eligible(&tool("get_then_delete_mission")));
        assert!(!eligible(&tool("run_kubectl_command")));
        assert!(!eligible(&tool("set_sensor_wifi")));
    }
}
