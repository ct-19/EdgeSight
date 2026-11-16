import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

type AppConfig = {
  llm_url: string;
  llm_model: string;
  mcp_url: string;
  mcp_protocol_version: string;
  permitted_tools: string[];
};

type Settings = AppConfig & { has_llm_key: boolean; has_mcp_token: boolean };
type Tool = {
  name: string;
  description: string;
  eligible_for_read_only_allowlist: boolean;
  annotations?: { readOnlyHint?: boolean };
};
type Turn = { role: "user" | "assistant"; content: string; tools_used?: string[] };
type ChatReply = { text: string; tools_used: string[]; model: string; mcp_warning?: string | null };
type Conn = "unknown" | "working" | "ok" | "fail";

const defaults: Settings = {
  llm_url: "http://127.0.0.1:11434/v1/chat/completions",
  llm_model: "qwen3:4b",
  mcp_url: "https://YOUR_MISSION_EDGESIGHT_URL.com/mcp",
  mcp_protocol_version: "2025-06-18",
  permitted_tools: [],
  has_llm_key: false,
  has_mcp_token: false
};

function Icon({ name, size = 18 }: { name: "settings" | "chevron" | "send" | "close" | "min" | "check" | "refresh" | "shield" | "drag"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes: Record<typeof name, ReactNode> = {
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7" /><path d="m19.4 15 .9 1.5-2 2-.5-.3-1.2-.7-1.5.6-.4 1.8h-2.8l-.4-1.8-1.5-.6-1.7 1-2-2 .9-1.5-.6-1.5-1.8-.4v-2.8l1.8-.4.6-1.5-.9-1.5 2-2 1.7 1 1.5-.6.4-1.8h2.8l.4 1.8 1.5.6 1.7-1 2 2-.9 1.5.6 1.5 1.8.4v2.8l-1.8.4z" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
    close: <><path d="M5 5 19 19M19 5 5 19" /></>,
    min: <path d="M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6 9a7 7 0 0 1 12-2l2 5"/><path d="m4 12 2 5a7 7 0 0 0 12-2"/></>,
    shield: <><path d="M12 2 3 6v6c0 6 5 9 9 10 4-1 9-4 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/></>,
    drag: <><circle cx="7" cy="6" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="17" cy="6" r="1"/><circle cx="7" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="17" cy="12" r="1"/></>
  };
  return <svg {...common} aria-hidden="true">{shapes[name]}</svg>;
}

function dotClass(s: Conn) { return s === "ok" ? "ok" : s === "fail" ? "fail" : s === "working" ? "loading" : "unknown"; }

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [panel, setPanel] = useState<"chat" | "settings">("chat");
  const [compact, setCompact] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [notice, setNotice] = useState("");
  const [mcpStatus, setMcpStatus] = useState<Conn>("unknown");
  const [llmStatus, setLlmStatus] = useState<Conn>("unknown");
  const [tools, setTools] = useState<Tool[]>([]);
  const [newMcpToken, setNewMcpToken] = useState("");
  const [newLlmKey, setNewLlmKey] = useState("");
  const [clearMcp, setClearMcp] = useState(false);
  const [clearLlm, setClearLlm] = useState(false);
  const [saving, setSaving] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const win = getCurrentWindow();

  useEffect(() => {
    invoke<Settings>("get_settings")
      .then(setSettings)
      .catch((e) => setNotice(`Settings error: ${String(e)}`))
      .finally(() => setLoadingSettings(false));
  }, []);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy, panel]);

  async function setWindowCompact(next: boolean) {
    setCompact(next);
    try {
      await win.setSize(new LogicalSize(next ? 170 : 420, next ? 180 : 650));
      if (!next) await win.setFocus();
    } catch (e) {
      setNotice(`Window resize failed: ${String(e)}`);
    }
  }
  function drag(e: MouseEvent<HTMLDivElement>) {
    if (e.button === 0) void win.startDragging();
  }
  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy) return;
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((prev) => [...prev, { role: "user", content: prompt }]);
    setDraft("");
    setNotice("");
    setBusy(true);
    try {
      const reply = await invoke<ChatReply>("send_chat", { prompt, history });
      setTurns((prev) => [...prev, { role: "assistant", content: reply.text, tools_used: reply.tools_used }]);
      setLlmStatus("ok");
      if (reply.mcp_warning) { setMcpStatus("fail"); setNotice(reply.mcp_warning); }
      else if (reply.tools_used.length > 0) setMcpStatus("ok");
    } catch (error) {
      setLlmStatus("fail");
      setNotice(`Chat failed: ${String(error)}`);
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  }
  async function saveSettings() {
    setSaving(true);
    setNotice("");
    try {
      const { has_llm_key: _a, has_mcp_token: _b, ...config } = settings;
      void _a; void _b;
      const res = await invoke<Settings>("save_settings", {
        update: {
          ...config,
          new_llm_key: newLlmKey,
          new_mcp_token: newMcpToken,
          clear_llm_key: clearLlm,
          clear_mcp_token: clearMcp
        }
      });
      setSettings(res);
      setNewMcpToken(""); setNewLlmKey(""); setClearMcp(false); setClearLlm(false);
      setLlmStatus("unknown"); setMcpStatus("unknown");
      setNotice("Settings saved. Keys are stored in macOS Keychain.");
    } catch (error) { setNotice(`Could not save: ${String(error)}`); }
    finally { setSaving(false); }
  }
  async function test(endpoint: "test_qwen" | "test_mcp") {
    const isLlm = endpoint === "test_qwen";
    const setter = isLlm ? setLlmStatus : setMcpStatus;
    setter("working"); setNotice("");
    try {
      const msg = await invoke<string>(endpoint);
      setter("ok"); setNotice(msg);
    } catch (error) {
      setter("fail"); setNotice(`${isLlm ? "Qwen" : "MCP"} test failed: ${String(error)}`);
    }
  }
  async function discover() {
    setMcpStatus("working"); setNotice("");
    try {
      const found = await invoke<Tool[]>("discover_mcp_tools");
      setTools(found); setMcpStatus("ok");
      setNotice(`${found.length} MCP tools found. Select only tools you have verified as read-only, then Save settings.`);
    } catch (error) {
      setMcpStatus("fail"); setNotice(`MCP discovery failed: ${String(error)}`);
    }
  }
  function toggleTool(name: string) {
    setSettings((current) => ({ ...current,
      permitted_tools: current.permitted_tools.includes(name)
        ? current.permitted_tools.filter((x) => x !== name)
        : [...current.permitted_tools, name]
    }));
  }
  const update = (key: keyof AppConfig, value: string) => setSettings((s) => ({ ...s, [key]: value }));

  if (compact) {
    return <div className="compact-shell">
      <div className="compact-drag" onMouseDown={drag} aria-label="Drag nSIght"><Icon name="drag" size={16}/></div>
      <button className="compact-main" title="Expand nSIght" onClick={() => void setWindowCompact(false)}>
        <div className="compact-avatar"><img src="/nsight-avatar.webp?v=2" alt="nSIght military analyst avatar" /></div>
        <div className="compact-identity"><span className="online-light"/> <strong>nSIght</strong><span className="compact-arrow">↗</span></div>
      </button>
    </div>;
  }

  return <main className="window-shell">
    <header className="titlebar">
      <div className="drag-handle" onMouseDown={drag} title="Drag nSIght"><Icon name="drag" size={18} /></div>
      <div className="title-text"><div className="eyebrow">MISSION EDGESIGHT / LOCAL AI</div><div className="product">nSIght</div></div>
      <div className="window-actions">
        <button title="Settings" className={`icon-btn ${panel === "settings" ? "active" : ""}`} onClick={() => { setPanel(panel === "settings" ? "chat" : "settings"); setNotice(""); }}><Icon name="settings"/></button>
        <button title="Collapse to compact nSIght" className="icon-btn" onClick={() => void setWindowCompact(true)}><Icon name="min"/></button>
        <button title="Exit nSIght" className="icon-btn exit" onClick={() => void invoke("quit_app")}><Icon name="close"/></button>
      </div>
    </header>

    {panel === "chat" ? <>
      <section className="analyst-stage">
        <div className="orb" aria-hidden="true"><div className="orb-inner" /></div>
        <div className={`avatar ${busy ? "thinking" : "idle"}`}><img src="/nsight-avatar.webp?v=2" alt="nSIght avatar wearing digital camouflage"/><span className="avatar-badge">AI</span></div>
        <div className="analyst-title"><strong>nSIght</strong><span className="analyst-subtitle">TACTICAL INTELLIGENCE · EDGE ANALYSIS</span></div>
        <div className="status-row">
          <span title="Qwen3 connection test" className="state-pill"><span className={`light ${dotClass(llmStatus)}`}/>QWEN3 · {settings.llm_model}</span>
          <span title="EdgeSight MCP connection test" className="state-pill"><span className={`light ${dotClass(mcpStatus)}`}/>EDGESIGHT MCP</span>
        </div>
      </section>

      <section className="conversation" aria-label="Conversation" aria-live="polite">
        {turns.length === 0 && <div className="intro">
          <div className="intro-message">What can I help you investigate?</div>
          <p>Ask about missions, sensors, detections, or platform health. Configure your Qwen and MCP endpoints in Settings first.</p>
          <div className="suggestions">
            <button onClick={() => { setDraft("Summarize the most recent EdgeSight mission using available MCP evidence."); composer.current?.focus(); }}>Latest mission</button>
            <button onClick={() => { setDraft("What is the health of my EdgeSight services and sensors?"); composer.current?.focus(); }}>System health</button>
          </div>
        </div>}
        {turns.map((turn, index) => <article key={index} className={`bubble ${turn.role}`}>
          <span className="bubble-label">{turn.role === "user" ? "YOU" : "nSIght"}</span>
          <div className="bubble-text">{turn.content}</div>
          {!!turn.tools_used?.length && <div className="tooltrace"><Icon name="check" size={12} /> MCP: {turn.tools_used.join(", ")}</div>}
        </article>)}
        {busy && <div className="bubble assistant typing"><span className="bubble-label">nSIght</span><div className="thinking-dots"><i/><i/><i/></div></div>}
        <div ref={messagesEnd} />
      </section>

      {notice && <div className="notice" role="status">{notice}</div>}
      <form onSubmit={(e) => void sendMessage(e)} className="composer">
        <textarea ref={composer} placeholder="Ask nSIght anything…" maxLength={8000} rows={2} value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <button className="send" title="Send" aria-label="Send message" disabled={busy || !draft.trim()} type="submit"><Icon name="send" size={18}/></button>
      </form>
      <footer className="footer"><span><Icon name="shield" size={12}/> LOCAL-FIRST · NO OPENAI API</span><span>{settings.permitted_tools.length} APPROVED TOOLS</span></footer>
    </> : <section className="settings-panel">
      <div className="settings-title"><div><div className="eyebrow">CONNECTIONS</div><h2>nSIght Settings</h2></div><button title="Back to chat" className="back-btn" onClick={() => setPanel("chat")}><Icon name="chevron"/> Chat</button></div>
      {loadingSettings ? <p>Loading settings…</p> : <>
        <div className="setting-section">
          <div className="setting-heading"><span>01</span><h3>LOCAL QWEN3</h3><span className={`light ${dotClass(llmStatus)}`}/></div>
          <label>OpenAI-compatible Chat Completions URL<input spellCheck={false} value={settings.llm_url} onChange={(e) => update("llm_url", e.target.value)}/></label>
          <label>Exact model name<input spellCheck={false} value={settings.llm_model} onChange={(e) => update("llm_model", e.target.value)}/></label>
          <label>API bearer token <em>{settings.has_llm_key && !clearLlm ? "(saved in Keychain)" : "(optional for local Ollama)"}</em><input value={newLlmKey} onChange={(e) => { setNewLlmKey(e.target.value); setClearLlm(false); }} type="password" placeholder={settings.has_llm_key ? "Leave blank to keep existing key" : "Optional"}/></label>
          {settings.has_llm_key && <label className="tiny-check"><input type="checkbox" checked={clearLlm} onChange={(e) => { setClearLlm(e.target.checked); setNewLlmKey(""); }} /> Remove saved Qwen key</label>}
          <button className="ghost" onClick={() => void test("test_qwen")} disabled={llmStatus === "working"}><Icon name="refresh" size={14}/> Test Qwen <span>saved settings</span></button>
        </div>
        <div className="setting-section">
          <div className="setting-heading"><span>02</span><h3>EDGESIGHT MCP</h3><span className={`light ${dotClass(mcpStatus)}`}/></div>
          <label>MCP Streamable HTTP endpoint<input spellCheck={false} value={settings.mcp_url} onChange={(e) => update("mcp_url", e.target.value)}/></label>
          <label>Protocol version<select value={settings.mcp_protocol_version} onChange={(e) => update("mcp_protocol_version", e.target.value)}>
            <option value="2025-06-18">2025-06-18 (default)</option><option value="2025-03-26">2025-03-26</option><option value="2025-11-25">2025-11-25</option>
          </select></label>
          <label>MCP bearer token <em>{settings.has_mcp_token && !clearMcp ? "(saved in Keychain)" : ""}</em><input value={newMcpToken} onChange={(e) => { setNewMcpToken(e.target.value); setClearMcp(false); }} type="password" placeholder={settings.has_mcp_token ? "Leave blank to keep existing token" : "Paste EdgeSight MCP token"}/></label>
          {settings.has_mcp_token && <label className="tiny-check"><input type="checkbox" checked={clearMcp} onChange={(e) => { setClearMcp(e.target.checked); setNewMcpToken(""); }} /> Remove saved MCP token</label>}
          <div className="button-row">
            <button className="ghost" onClick={() => void test("test_mcp")} disabled={mcpStatus === "working"}><Icon name="refresh" size={14}/> Test MCP</button>
            <button className="ghost" onClick={() => void discover()} disabled={mcpStatus === "working"}>Discover tools</button>
          </div>
        </div>
        <div className="setting-section">
          <div className="setting-heading"><span>03</span><h3>READ-ONLY TOOL ALLOWLIST</h3></div>
          <p className="setting-help">Only explicitly enabled tools are exposed to Qwen. Eligibility checks are conservative but not a substitute for confirming that a tool cannot mutate EdgeSight.</p>
          {tools.length > 0 ? <div className="tool-list">{tools.map((tool) => <label key={tool.name} className={`tool-row ${!tool.eligible_for_read_only_allowlist ? "blocked" : ""}`}>
            <input type="checkbox" checked={settings.permitted_tools.includes(tool.name)} disabled={!tool.eligible_for_read_only_allowlist} onChange={() => toggleTool(tool.name)}/>
            <span><strong>{tool.name}</strong><small>{tool.description || (tool.eligible_for_read_only_allowlist ? "Read-only candidate" : "Not eligible in Phase 1")}</small></span>
          </label>)}</div> : <p className="empty-tools">No discovered tools in this session. Save your endpoint and token, then choose Discover tools.</p>}
          <p className="setting-help">{settings.permitted_tools.length} permitted · up to 14 exposed per question · no write/control tool calls.</p>
        </div>
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="settings-actions"><button className="primary" onClick={() => void saveSettings()} disabled={saving}>{saving ? "Saving…" : "Save settings & Keychain credentials"}</button></div>
      </>}
    </section>}
  </main>;
}
