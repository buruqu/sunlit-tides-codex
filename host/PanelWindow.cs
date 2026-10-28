using System.Reflection;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SunlitTidesCodex;

internal sealed class PanelWindow : Form
{
    private readonly IntPtr _owner;
    private readonly uint _ownerPid;
    private readonly string _session;
    private readonly Action<string> _respond;
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 16 };
    private JsonElement _snapshot;
    private int _revision;
    private double _offsetX, _offsetY;
    private bool _dragging, _loaded, _docked;
    private bool _announced;
    private bool _navigationPending;
    private string _trustedSource = "";
    internal string Diagnostic { get; private set; } = "created";
    internal PanelWindow(IntPtr owner, JsonElement snapshot, Action<string> respond)
    {
        _owner = owner; PanelNative.GetWindowThreadProcessId(owner, out _ownerPid);
        var scale = Math.Max(96, PanelNative.GetDpiForWindow(owner)) / 96.0;
        _session = PanelProtocol.Text(snapshot, "session"); _respond = respond; _snapshot = snapshot;
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual;
        Opacity = 0;
        MinimumSize = new Size(280, 180); Text = "晴光与泡影 · 面板";
        Controls.Add(_web);
        ClientSize = new Size((int)(Math.Clamp(PanelProtocol.Number(snapshot, "width", 480), 280, 1600) * scale), (int)(Math.Clamp(PanelProtocol.Number(snapshot, "height", 680), 180, 1600) * scale));
        _offsetX = Math.Clamp(PanelProtocol.Number(snapshot, "offsetX", 40), 0, Width / scale);
        _offsetY = Math.Clamp(PanelProtocol.Number(snapshot, "offsetY", 20), 0, Height / scale);
        PanelNative.GetCursorPos(out var cursor);
        Location = new Point(cursor.X - (int)(_offsetX * scale), cursor.Y - (int)(_offsetY * scale));
        EnsureAccessible();
        _dragging = (PanelNative.GetAsyncKeyState(1) & 0x8000) != 0;
        _revision = PanelProtocol.Number(snapshot, "revision");
        DpiChanged += (_, _) => BeginInvoke(() => { if (!IsDisposed) { ApplySnapshotSize(); if (_dragging) FollowCursor(); else EnsureAccessible(); } });
        Shown += async (_, _) => await InitializeAsync();
        _timer.Tick += (_, _) => Tick(); _timer.Start();
        FormClosed += (_, _) => { _timer.Dispose(); _web.Dispose(); Send(_docked ? "dock" : "closed"); };
    }
    private async Task InitializeAsync()
    {
        try
        {
            Diagnostic = "initializing";
            PanelNative.SetWindowLongPtr(Handle, -8, _owner);
            var profile = Path.Combine(Path.GetTempPath(), "SunlitTidesPanels", Environment.ProcessId.ToString());
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            Diagnostic = "environment-created";
            if (IsDisposed) return;
            await _web.EnsureCoreWebView2Async(environment);
            Diagnostic = "core-ready";
            var core = _web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false; core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false; core.Settings.AreDefaultScriptDialogsEnabled = false;
            core.Settings.IsStatusBarEnabled = false; core.Settings.IsBuiltInErrorPageEnabled = false;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.DownloadStarting += (_, e) => e.Cancel = true;
            core.NavigationStarting += (_, e) =>
            {
                if (_navigationPending && e.Uri.StartsWith("data:text/html;charset=utf-8;base64,", StringComparison.Ordinal))
                { _trustedSource = "about:blank"; _navigationPending = false; }
                else e.Cancel = true;
            };
            core.FrameNavigationStarting += (_, e) => { if (e.Uri is not ("about:srcdoc" or "about:blank")) e.Cancel = true; };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) =>
            {
                if (!e.Request.Uri.StartsWith("data:", StringComparison.Ordinal) && !e.Request.Uri.StartsWith("about:", StringComparison.Ordinal))
                    e.Response = environment.CreateWebResourceResponse(new MemoryStream(), 403, "Blocked", "Content-Type: text/plain");
            };
            core.WebMessageReceived += (_, e) =>
            {
                if (e.Source != _trustedSource) return;
                try
                {
                    var raw = e.WebMessageAsJson;
                    if (raw.Length > PanelProtocol.MaxMessage) return;
                    using var d = JsonDocument.Parse(raw); var m = d.RootElement;
                    var type = PanelProtocol.Text(m, "type");
                    if (type == "ready") { _loaded = true; Deliver(_snapshot); }
                    else if (type == "rendered" && !_announced && PanelProtocol.Text(m, "session") == _session)
                    { _announced = true; Opacity = 1; Send("ready"); }
                    else if (type == "drag")
                    {
                        PanelNative.GetCursorPos(out var c); var scale = DeviceDpi / 96.0; _offsetX = (c.X - Left) / scale; _offsetY = (c.Y - Top) / scale;
                        _dragging = (PanelNative.GetAsyncKeyState(1) & 0x8000) != 0;
                    }
                    else if (type == "dock") { _docked = true; Close(); }
                    else if (type == "event" && PanelProtocol.Text(m, "session") == _session
                        && PanelProtocol.Number(m, "revision") <= _revision
                        && PanelProtocol.Text(m, "nodeId").Length is > 0 and <= 100
                        && (PanelProtocol.Text(m, "event") is "click" or "input" or "change" or "toggle" or "scroll" or "file" or "file-start" or "file-chunk" or "file-end"
                            || PanelProtocol.Text(m, "event") == "key" && PanelProtocol.Text(m, "key") == "Escape")) _respond(raw);
                }
                catch { Send("error", "invalid-carrier-event"); }
            };
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("SunlitTidesCodex.PanelCarrier.html")!;
            using var reader = new StreamReader(stream); _navigationPending = true; core.NavigateToString(await reader.ReadToEndAsync());
            Diagnostic = "navigated";
        }
        catch (Exception e) { Send("error", "webview-unavailable:" + e.GetType().Name + ":" + e.HResult); Close(); }
    }
    internal void Update(JsonElement message)
    {
        var revision = PanelProtocol.Number(message, "revision"); if (revision < _revision) return;
        _revision = revision; _snapshot = message; Deliver(message);
        ApplySnapshotSize();
    }
    private void ApplySnapshotSize()
    {
        var scale = DeviceDpi / 96.0;
        ClientSize = new Size((int)(Math.Clamp(PanelProtocol.Number(_snapshot, "width", (int)(ClientSize.Width / scale)), 280, 1600) * scale), (int)(Math.Clamp(PanelProtocol.Number(_snapshot, "height", (int)(ClientSize.Height / scale)), 180, 1600) * scale));
    }
    internal void Deliver(JsonElement message) { if (_loaded && !IsDisposed) _web.CoreWebView2.PostWebMessageAsJson(message.GetRawText()); }
    internal Task<string> InspectForTestAsync(string expression) => _web.CoreWebView2.ExecuteScriptAsync(expression);
    private void Send(string type, string? error = null)
    {
        var origin = new PanelNative.Point(); PanelNative.ClientToScreen(_owner, ref origin);
        var scale = Math.Max(96, PanelNative.GetDpiForWindow(_owner)) / 96.0;
        _respond(JsonSerializer.Serialize(new { type, session = _session, revision = _revision, error, screenX = Left, screenY = Top, ownerClientX = (Left - origin.X) / scale, ownerClientY = (Top - origin.Y) / scale, width = ClientSize.Width, height = ClientSize.Height, scale }));
    }
    private void Tick()
    {
        PanelNative.GetWindowThreadProcessId(_owner, out var pid);
        if (!PanelNative.IsWindow(_owner) || pid != _ownerPid) { Close(); return; }
        if (PanelNative.IsIconic(_owner) || !PanelNative.IsWindowVisible(_owner)) { if (Visible) Hide(); return; }
        if (!Visible) Show();
        if (!_dragging) return;
        PanelNative.GetCursorPos(out var cursor);
        FollowCursor();
        if ((PanelNative.GetAsyncKeyState(1) & 0x8000) == 0)
        {
            _dragging = false;
            if (PanelNative.Inside(_owner, cursor)) { _docked = true; Close(); }
            else { EnsureAccessible(); Send("moved"); }
        }
    }
    private void FollowCursor()
    {
        PanelNative.GetCursorPos(out var cursor); var scale = DeviceDpi / 96.0;
        Location = new Point(cursor.X - (int)(_offsetX * scale), cursor.Y - (int)(_offsetY * scale));
    }
    private void EnsureAccessible()
    {
        var work = Screen.FromPoint(new Point(Left + Width / 2, Top + Math.Min(20, Height / 2))).WorkingArea;
        var visibleTitle = (int)(48 * Math.Max(1, DeviceDpi / 96.0));
        Location = new Point(Math.Clamp(Left, work.Left - Math.Max(0, Width - visibleTitle), work.Right - visibleTitle), Math.Clamp(Top, work.Top, Math.Max(work.Top, work.Bottom - visibleTitle)));
    }
}
