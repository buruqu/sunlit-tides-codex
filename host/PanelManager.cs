using System.Text.Json;

namespace SunlitTidesCodex;

// One STA owns all WebViews. CDP's receive loop and DSH's pipe never touch controls.
internal sealed class PanelManager : IDisposable
{
    private readonly Thread _thread;
    private readonly ManualResetEventSlim _ready = new();
    private Control? _dispatcher;
    private readonly Dictionary<string, PanelWindow> _windows = [];
    internal PanelManager()
    {
        _thread = new Thread(() => { _dispatcher = new Control(); _ = _dispatcher.Handle; _ready.Set(); Application.Run(); _dispatcher.Dispose(); }) { IsBackground = true, Name = "Sunlit panel UI" };
        _thread.SetApartmentState(ApartmentState.STA); _thread.Start(); _ready.Wait();
    }
    internal void Request(string scope, JsonElement message, IntPtr owner, Action<string> respond)
    {
        if (!PanelProtocol.Valid(message)) { respond("{\"type\":\"error\",\"error\":\"invalid-request\"}"); return; }
        Dispatch(() =>
        {
            var session = PanelProtocol.Text(message, "session"); var key = scope + ":" + session;
            var type = PanelProtocol.Text(message, "type");
            if (type == "open")
            {
                if (_windows.TryGetValue(key, out var prior)) { prior.Update(message); return; }
                if (!PanelNative.IsWindow(owner) || _windows.Count >= 8)
                { respond(JsonSerializer.Serialize(new { type = "error", session, revision = PanelProtocol.Number(message, "revision"), error = "owner-unavailable" })); return; }
                var window = new PanelWindow(owner, message, respond);
                _windows[key] = window;
                window.FormClosed += (_, _) => _windows.Remove(key);
                window.Show();
            }
            else if (_windows.TryGetValue(key, out var window))
            {
                if (type == "close") window.Close();
                else if (type is "pick-file" or "file-ack") window.Deliver(message);
                else window.Update(message);
            }
        });
    }
    internal void CloseScope(string scope) => Dispatch(() => { foreach (var pair in _windows.Where(p => p.Key.StartsWith(scope + ":", StringComparison.Ordinal)).ToArray()) pair.Value.Close(); });
    private void Dispatch(Action action) { try { _dispatcher?.BeginInvoke(() => { try { action(); } catch { /* A closing carrier or malformed input cannot tear down the helper. */ } }); } catch (InvalidOperationException) { } }
    public void Dispose() { Dispatch(() => { foreach (var w in _windows.Values.ToArray()) w.Close(); Application.ExitThread(); }); _thread.Join(3000); _ready.Dispose(); }
}
