using System.Runtime.InteropServices;
using System.Text.Json;

namespace SunlitTidesCodex;

// Isolated real WebView/native-window exercise. It never discovers or connects to Codex/DSH.
internal static class PanelSelfTests
{
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(PanelNative.Point point);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    internal static int Run()
    {
        ApplicationConfiguration.Initialize();
        var folder = Path.Combine(Environment.CurrentDirectory, "work", "panel-native-evidence"); Directory.CreateDirectory(folder);
        using var owner = new Form { Text = "Sunlit native panel isolated acceptance", StartPosition = FormStartPosition.Manual, Location = new Point(40, 60), Size = new Size(650, 540), TopMost = true };
        var label = new Label { Dock = DockStyle.Fill, Text = "Isolated owner window\nNative carrier returns here when its title is dragged inside.", TextAlign = ContentAlignment.MiddleCenter }; owner.Controls.Add(label);
        var result = 1;
        owner.Shown += async (_, _) =>
        {
            PanelNative.GetCursorPos(out var originalCursor);
            PanelWindow? panel = null;
            try
            {
                var events = new List<JsonElement>();
                using (var distractor = new Form { Text = "Isolated second owner", StartPosition = FormStartPosition.Manual, Location = new Point(850, 60), Size = new Size(420, 420), TopMost = true })
                {
                    distractor.Show(); ShowWindow(owner.Handle, 5); ShowWindow(distractor.Handle, 5);
                    var origin = new PanelNative.Point(); PanelNative.ClientToScreen(owner.Handle, ref origin); var ownerScale = owner.DeviceDpi / 96.0;
                    using var hint = JsonDocument.Parse(JsonSerializer.Serialize(new { viewport = new { left = origin.X / ownerScale, top = origin.Y / ownerScale, width = owner.ClientSize.Width / ownerScale, height = owner.ClientSize.Height / ownerScale } }));
                    SetCursorPos(distractor.Left + 100, distractor.Top + 100);
                    if (PanelNative.FindOwner(Environment.ProcessId, hints: hint.RootElement) != owner.Handle) throw new Exception("multiwindow-viewport-owner-mismatch");
                    if (PanelNative.FindOwner(Environment.ProcessId) != distractor.Handle) throw new Exception("multiwindow-cursor-owner-mismatch");
                    distractor.Close();
                }
                using var document = JsonDocument.Parse(JsonSerializer.Serialize(new { type = "open", session = "isolated-native-test", revision = 1, width = 420, height = 460, theme = "dark", html = "<section style='background:#242335;color:#fff;height:100vh'><header data-panel-drag style='padding:16px;background:#46405d'>主题编辑器 · Native carrier</header><div style='padding:20px'><label>独立面板测试 <input data-panel-node='field' value='draft survives'></label><button data-panel-node='apply'>应用</button><p>原始编辑器保留权威草稿</p></div></section>", css = "body{font:15px system-ui;margin:0}input,button{margin:12px;padding:8px}" }));
                SetCursorPos(820, 140);
                panel = new PanelWindow(owner.Handle, document.RootElement.Clone(), json => { using var d = JsonDocument.Parse(json); events.Add(d.RootElement.Clone()); });
                panel.Show();
                ShowWindow(owner.Handle, 5); ShowWindow(panel.Handle, 5);
                var deadline = DateTime.UtcNow.AddSeconds(8);
                while (!events.Any(e => PanelProtocol.Text(e, "type") == "ready") && DateTime.UtcNow < deadline) await Task.Delay(50);
                if (!events.Any(e => PanelProtocol.Text(e, "type") == "ready")) throw new Exception("native-webview-not-ready:" + panel.Diagnostic + ":" + JsonSerializer.Serialize(events));
                await Task.Delay(500);
                panel.TopMost = true; panel.BringToFront(); panel.Activate(); await Task.Delay(200);
                var start = panel.Location;
                if (GetAncestor(WindowFromPoint(new PanelNative.Point { X = panel.Left + 80, Y = panel.Top + 24 }), 2) != panel.Handle) throw new Exception("isolated-carrier-not-visible-at-test-position");
                using (var initial = new Bitmap(panel.Width, panel.Height)) { using var g = Graphics.FromImage(initial); g.CopyFromScreen(panel.Left, panel.Top, 0, 0, initial.Size); initial.Save(Path.Combine(folder, "native-initial.png")); }
                async Task ClickNode(string nodeId)
                {
                    var json = await panel.InspectForTestAsync("(()=>{const r=document.getElementById('surface').contentDocument.querySelector('[data-panel-node=\"" + nodeId + "\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
                    using var bounds = JsonDocument.Parse(json); var scale = panel.DeviceDpi / 96.0;
                    var point = new PanelNative.Point { X = panel.Left + (int)(bounds.RootElement.GetProperty("x").GetDouble() * scale), Y = panel.Top + (int)(bounds.RootElement.GetProperty("y").GetDouble() * scale) };
                    if (GetAncestor(WindowFromPoint(point), 2) != panel.Handle) throw new Exception("isolated-control-not-visible");
                    SetCursorPos(point.X, point.Y); mouse_event(2, 0, 0, 0, UIntPtr.Zero); mouse_event(4, 0, 0, 0, UIntPtr.Zero); await Task.Delay(100);
                }
                await ClickNode("field"); SendKeys.SendWait("123{ENTER}"); await Task.Delay(150);
                var inputEvent = events.LastOrDefault(e => PanelProtocol.Text(e, "event") == "input");
                if (inputEvent.ValueKind != JsonValueKind.Object || !PanelProtocol.Text(inputEvent, "value").Contains("123")) throw new Exception("native-input-event-missing:" + JsonSerializer.Serialize(events));
                await ClickNode("apply");
                if (!events.Any(e => PanelProtocol.Text(e, "event") == "click" && PanelProtocol.Text(e, "nodeId") == "apply")) throw new Exception("native-button-event-missing");
                SendKeys.SendWait("{ESC}"); await Task.Delay(100);
                if (!events.Any(e => PanelProtocol.Text(e, "event") == "key" && PanelProtocol.Text(e, "key") == "Escape")) throw new Exception("native-escape-event-missing");
                using var roundTrip = JsonDocument.Parse(document.RootElement.GetRawText().Replace("draft survives", "authoritative round trip")); panel.Update(roundTrip.RootElement.Clone()); await Task.Delay(150);
                var readBack = await panel.InspectForTestAsync("document.getElementById('surface').contentDocument.querySelector('[data-panel-node=field]').value");
                if (JsonSerializer.Deserialize<string>(readBack) != "authoritative round trip") throw new Exception("native-authoritative-update-missing");
                SetCursorPos(panel.Left + 80, panel.Top + 24); mouse_event(2, 0, 0, 0, UIntPtr.Zero); await Task.Delay(150);
                SetCursorPos(start.X + 200, start.Y + 100); await Task.Delay(250);
                mouse_event(4, 0, 0, 0, UIntPtr.Zero); await Task.Delay(100);
                if (panel.IsDisposed || panel.Left == start.X) throw new Exception("native-held-drag-did-not-move");
                using (var screenshot = new Bitmap(panel.Width, panel.Height))
                { using var graphics = Graphics.FromImage(screenshot); graphics.CopyFromScreen(panel.Left, panel.Top, 0, 0, screenshot.Size); screenshot.Save(Path.Combine(folder, "native-detached.png")); }
                SetCursorPos(panel.Left + 80, panel.Top + 24); mouse_event(2, 0, 0, 0, UIntPtr.Zero); await Task.Delay(150);
                SetCursorPos(owner.Left + 200, owner.Top + 160); await Task.Delay(250);
                mouse_event(4, 0, 0, 0, UIntPtr.Zero); await Task.Delay(200);
                if (!events.Any(e => PanelProtocol.Text(e, "type") == "dock")) throw new Exception("native-return-did-not-dock");
                File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new { ok = true, checks = new[] { "same-process-viewport-selects-original-window", "same-process-cursor-selects-nearest-window", "real-webview-rendered-before-ready", "native-text-input-bridges-to-owner", "native-button-click-bridges-to-owner", "native-escape-bridges-to-owner", "authoritative-owner-update-renders-in-carrier", "held-mouse-native-titlebar-moves-window", "outside-release-keeps-carrier", "inside-owner-release-docks" }, events }));
                result = 0;
            }
            catch (Exception e) { File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new { ok = false, error = e.Message })); }
            finally { mouse_event(4, 0, 0, 0, UIntPtr.Zero); SetCursorPos(originalCursor.X, originalCursor.Y); panel?.Close(); owner.Close(); }
        };
        Application.Run(owner); return result;
    }
}
