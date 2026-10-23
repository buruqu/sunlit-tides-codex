using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace SunlitTidesCodex;

internal sealed record CdpTarget(string Id, Uri Socket);
internal sealed class MissingCdpScriptException : Exception { }

internal static class TargetValidation
{
    internal static bool IsPage(string? type, string? url)
    {
        if (!(string.Equals(type, "page", StringComparison.OrdinalIgnoreCase)
            && Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && uri.Scheme == "app" && uri.Host == "-" && uri.AbsolutePath == "/index.html" && string.IsNullOrEmpty(uri.UserInfo) && uri.Port == -1)) return false;
        try
        {
            foreach (var part in uri.Query.TrimStart('?').Split('&'))
            {
                var pair = part.Split('=', 2);
                if (Uri.UnescapeDataString(pair[0]) == "initialRoute" && pair.Length == 2 && Uri.UnescapeDataString(pair[1].Replace('+', ' ')).Contains("avatar-overlay", StringComparison.OrdinalIgnoreCase)) return false;
            }
        }
        catch (UriFormatException) { return false; }
        return true;
    }
    internal static bool IsSocket(string? value, int port)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && uri.Scheme == "ws" && uri.Port == port && string.IsNullOrEmpty(uri.UserInfo)
            && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment)
            && IPAddress.TryParse(uri.Host.Trim('[', ']'), out var ip) && IPAddress.IsLoopback(ip)
            && uri.AbsolutePath.StartsWith("/devtools/page/", StringComparison.Ordinal);
    }
}

internal sealed class CdpDiscovery : IDisposable
{
    private readonly HttpClient _http = new(new SocketsHttpHandler { UseProxy = false, AllowAutoRedirect = false }) { Timeout = TimeSpan.FromMilliseconds(1200) };
    internal async Task<IReadOnlyList<CdpTarget>> FindAsync(OwnedPort port, CodexPackage package, CancellationToken token)
    {
        if (!package.OwnsProcess(port.ProcessId)) return [];
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMilliseconds(1500));
        token = timeout.Token;
        using var response = await _http.GetAsync($"http://127.0.0.1:{port.Port}/json/list", HttpCompletionOption.ResponseHeadersRead, token);
        if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > 1024 * 1024) return [];
        using var stream = await response.Content.ReadAsStreamAsync(token);
        using var memory = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(buffer, token)) > 0)
        {
            if (memory.Length + read > 1024 * 1024) return [];
            memory.Write(buffer, 0, read);
        }
        using var document = JsonDocument.Parse(memory.ToArray());
        if (document.RootElement.ValueKind != JsonValueKind.Array) return [];
        var results = new List<CdpTarget>();
        foreach (var item in document.RootElement.EnumerateArray())
        {
            string? Value(string key) => item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
            var id = Value("id");
            var socket = Value("webSocketDebuggerUrl");
            if (!string.IsNullOrEmpty(id) && id.Length <= 200 && TargetValidation.IsPage(Value("type"), Value("url")) && TargetValidation.IsSocket(socket, port.Port))
                results.Add(new(id, new UriBuilder(socket!) { Host = "127.0.0.1" }.Uri));
        }
        // Recheck ownership after the HTTP request; never trust a JSON endpoint by itself.
        return PortOwnership.Find(package).Any(p => p == port) ? results : [];
    }
    public void Dispose() => _http.Dispose();
}

internal sealed class CdpConnection : IAsyncDisposable
{
    private readonly ClientWebSocket _socket = new();
    private readonly ConcurrentDictionary<int, TaskCompletionSource<JsonElement>> _pending = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly CancellationTokenSource _stop = new();
    private Task? _reader;
    private int _nextId;
    internal bool Ready => _socket.State == WebSocketState.Open && _reader is { IsCompleted: false };
    internal event Action? Navigated;
    internal event Action<string>? StartupSettingChanged;

    internal async Task ConnectAsync(Uri socket, CancellationToken token)
    {
        _socket.Options.Proxy = null;
        _socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(30);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(3));
        await _socket.ConnectAsync(socket, timeout.Token);
        _reader = ReadAsync();
    }

    internal async Task<JsonElement> SendAsync(string method, object parameters, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token, _stop.Token);
        timeout.CancelAfter(TimeSpan.FromSeconds(25));
        var id = Interlocked.Increment(ref _nextId);
        var source = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!_pending.TryAdd(id, source)) throw new InvalidOperationException("cdp-id");
        try
        {
            var bytes = JsonSerializer.SerializeToUtf8Bytes(new { id, method, @params = parameters });
            if (bytes.Length > 256 * 1024 * 1024) throw new InvalidOperationException("payload-too-large");
            await _sendLock.WaitAsync(timeout.Token);
            try { await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, timeout.Token); }
            finally { _sendLock.Release(); }
            var result = await source.Task.WaitAsync(timeout.Token);
            if (result.TryGetProperty("error", out var error))
            {
                if (method == "Page.removeScriptToEvaluateOnNewDocument" && error.TryGetProperty("message", out var message)
                    && message.GetString() is "Script not found" or "No script with given id") throw new MissingCdpScriptException();
                throw new InvalidOperationException("cdp-rejected");
            }
            return result.TryGetProperty("result", out var value) ? value.Clone() : default;
        }
        finally { _pending.TryRemove(id, out _); }
    }

    internal async Task<JsonElement> EvaluateAsync(string expression, CancellationToken token)
    {
        var response = await SendAsync("Runtime.evaluate", new { expression, awaitPromise = true, returnByValue = true, silent = true }, token);
        if (response.TryGetProperty("exceptionDetails", out _)) throw new InvalidOperationException("theme-evaluation-failed");
        return response.TryGetProperty("result", out var result) && result.TryGetProperty("value", out var value) ? value.Clone() : default;
    }

    private async Task ReadAsync()
    {
        var buffer = new byte[16 * 1024];
        try
        {
            while (!_stop.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                using var message = new MemoryStream();
                WebSocketReceiveResult frame;
                do
                {
                    frame = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), _stop.Token);
                    if (frame.MessageType == WebSocketMessageType.Close) return;
                    if (frame.MessageType != WebSocketMessageType.Text || message.Length + frame.Count > 1024 * 1024)
                        throw new InvalidOperationException("cdp-message-limit");
                    message.Write(buffer, 0, frame.Count);
                } while (!frame.EndOfMessage);
                using var document = JsonDocument.Parse(message.ToArray());
                var root = document.RootElement;
                if (root.TryGetProperty("id", out var id) && _pending.TryGetValue(id.GetInt32(), out var pending)) pending.TrySetResult(root.Clone());
                else if (root.TryGetProperty("method", out var method))
                {
                    if (method.GetString() is "Page.frameNavigated" or "Page.domContentEventFired" or "Page.loadEventFired") Navigated?.Invoke();
                    else if (method.GetString() == "Runtime.bindingCalled" && root.TryGetProperty("params", out var parameters)
                        && parameters.TryGetProperty("name", out var name) && name.GetString() == "sunlitTidesStartupChanged"
                        && parameters.TryGetProperty("payload", out var payload) && payload.ValueKind == JsonValueKind.String
                        && payload.GetString() is { Length: <= 100 } value) StartupSettingChanged?.Invoke(value);
                }
            }
        }
        catch (Exception) { /* Protocol data and errors may contain user content; do not log them. */ }
        finally
        {
            foreach (var pending in _pending.Values) pending.TrySetException(new IOException("cdp-disconnected"));
        }
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        _socket.Abort();
        if (_reader is not null) try { await _reader; } catch { }
        _socket.Dispose();
        _stop.Dispose();
        _sendLock.Dispose();
    }
}
