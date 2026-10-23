using System.Text.Json;
using System.Net.Http;

namespace SunlitTidesCodex;

internal sealed class ThemeHost : IAsyncDisposable
{
    private sealed class PageSession(CdpConnection connection, int pid, int port, string targetId)
    {
        internal CdpConnection Connection = connection;
        internal int Pid = pid, Port = port;
        internal string Key = $"{pid}:{port}:{targetId}";
        internal List<string> ScriptIds = [];
        internal bool Restored;
        internal bool BridgeInitialized;
        internal bool SentStartupEnabled;
    }
    private readonly StateStore _store;
    private readonly SemaphoreSlim _gate = new(1, 1), _wake = new(0, 1);
    private readonly CancellationTokenSource _stop = new();
    private readonly CdpDiscovery _discovery = new();
    private readonly Dictionary<string, PageSession> _pages = [];
    private readonly Dictionary<string, List<string>> _registrations = [];
    private volatile Settings _settings;
    private volatile CodexPackage? _package;
    private DateTimeOffset _packageAt;
    private Task? _loop;
    private string _apply = "", _bootstrap = "", _remove = "", _probe = "";
    private Health _health;
    private readonly StartupWatcher _startup;
    internal event Action<Health>? Changed;
    internal event Action<string>? Notice;
    internal event Action<IntPtr>? StartupRequested;
    internal bool StartupEnabled => _settings.StartupEnabled;
    internal bool AutomaticStartupEnabled { get { var settings = _settings; return settings.Enabled && settings.StartupEnabled; } }
    internal Health Current => _health with { UpdatedAt = DateTimeOffset.Now };

    internal ThemeHost(StateStore store)
    {
        _store = store;
        _settings = store.Read();
        _startup = new(() => _package, () => _settings.Enabled && _settings.StartupEnabled);
        _startup.Play += window => StartupRequested?.Invoke(window);
        _health = new(true, _settings.Enabled, "starting", 0, null, DateTimeOffset.Now);
        try
        {
            var file = Path.Combine(StateStore.DataDirectory, "registrations.json");
            if (File.Exists(file))
                foreach (var pair in JsonSerializer.Deserialize<Dictionary<string, List<string>>>(File.ReadAllText(file)) ?? [])
                    if (pair.Key.Length <= 300 && pair.Value.Count <= 100 && pair.Value.All(id => id.Length <= 200)) _registrations[pair.Key] = pair.Value;
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException) { }
    }

    internal void Start(bool launch, bool enable)
    {
        _startup.Start();
        _loop = Task.Run(async () =>
        {
            try
            {
                LoadTheme();
                if (enable) await SetEnabledAsync(true, launch, _stop.Token);
                else if (launch && _settings.Enabled) await LaunchAsync(_stop.Token);
                while (!_stop.IsCancellationRequested)
                {
                    try { await ReconcileAsync(_stop.Token); }
                    catch (OperationCanceledException) when (_stop.IsCancellationRequested) { break; }
                    catch { Update("connection-unavailable", null); }
                    await _wake.WaitAsync(TimeSpan.FromSeconds(5), _stop.Token);
                }
            }
            catch (OperationCanceledException) when (_stop.IsCancellationRequested) { }
            catch { Update("theme-files-invalid", null); }
        });
    }

    internal async Task<Health> RestoreOnceAsync(CancellationToken token)
    {
        _settings = _settings with { Enabled = false };
        _store.Save(_settings);
        LoadTheme();
        await SetEnabledAsync(false, false, token);
        return Current;
    }

    private void LoadTheme()
    {
        var folder = Path.Combine(AppContext.BaseDirectory, "theme");
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(folder, "manifest.json")));
        if (manifest.RootElement.GetProperty("id").GetString() != "sunlit-tides.codex"
            || manifest.RootElement.GetProperty("version").GetString() != "1.1.0"
            || manifest.RootElement.GetProperty("config").GetProperty("designVersion").GetString() != "1.1.0") throw new InvalidDataException("manifest-invalid");
        string Expression(string file)
        {
            var path = Path.Combine(folder, file);
            if (new FileInfo(path).Length > 160 * 1024 * 1024) throw new InvalidDataException("theme-file-limit");
            return File.ReadAllText(path).Trim().TrimEnd(';');
        }
        var payload = Expression("payload.js");
        var removal = Expression("remove.js");
        var scripts = ScriptBuilder.Build(payload, removal, manifest.RootElement.GetProperty("fingerprint").GetString() ?? "");
        (_apply, _bootstrap, _remove, _probe) = (scripts.Apply, scripts.Bootstrap, scripts.Remove, scripts.Probe);
    }

    internal async Task SetEnabledAsync(bool enabled, bool launch, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            _settings = _settings with { Enabled = enabled };
            _store.Save(_settings); // Disable before removing future scripts and live runtime.
            if (_remove.Length == 0) LoadTheme();
            if (!enabled) await RestoreSessionsAsync(token);
            Update(enabled ? "waiting-for-codex" : "default", _health.Port);
        }
        finally { _gate.Release(); }
        Wake();
        if (!enabled) await ReconcileAsync(token);
        if (enabled && launch) await LaunchAsync(token);
    }

    internal async Task SetStartupEnabledAsync(bool enabled, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            _settings = _settings with { StartupEnabled = enabled };
            _store.Save(_settings);
            foreach (var page in _pages.Values.Where(p => p.Connection.Ready))
            {
                try { await PublishStartupAsync(page, token); }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
                catch { page.BridgeInitialized = false; }
            }
            Update(_health.State, _health.Port);
        }
        finally { _gate.Release(); }
        Wake();
    }

    private async Task PublishStartupAsync(PageSession page, CancellationToken token)
    {
        await page.Connection.EvaluateAsync(StartupSettingsBridge.Publish(_settings.StartupEnabled), token);
        page.SentStartupEnabled = _settings.StartupEnabled;
        page.BridgeInitialized = true;
    }

    private async Task ReceiveStartupChangeAsync(bool enabled)
    {
        try { await SetStartupEnabledAsync(enabled, _stop.Token); }
        catch { /* Keep protocol payloads and user state out of diagnostics. */ }
    }

    private async Task SyncStartupAsync(PageSession page, CancellationToken token)
    {
        if (page.BridgeInitialized)
        {
            var raw = await page.Connection.EvaluateAsync(StartupSettingsBridge.Read, token);
            if (raw.ValueKind == JsonValueKind.String && raw.GetString() is "true" or "false")
            {
                var incoming = raw.GetString() == "true";
                // Compare with this page's last publication, not the current global value:
                // an unchanged old page must never revert a newer choice from another page.
                if (incoming != page.SentStartupEnabled)
                {
                    _settings = _settings with { StartupEnabled = incoming };
                    _store.Save(_settings);
                }
            }
        }
        await PublishStartupAsync(page, token);
    }

    internal async Task LaunchAsync(CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            _package = await CodexPackage.DiscoverAsync(token);
            _packageAt = DateTimeOffset.Now;
            var owned = PortOwnership.Find(_package);
            var hasDebug = false;
            foreach (var port in owned)
            {
                try { if ((await _discovery.FindAsync(port, _package, token)).Count > 0) { hasDebug = true; break; } }
                catch (Exception e) when (e is HttpRequestException or OperationCanceledException or JsonException) { token.ThrowIfCancellationRequested(); }
            }
            if (_package.IsRunning())
            {
                _ = _package.Launch(null); // Activate the existing instance without touching its tasks.
                if (!hasDebug)
                {
                    Update("reopen-through-theme-launcher", null);
                    Notice?.Invoke("Codex 当前未开放主题连接。请在任务完成后自行退出 Codex，再从「Codex · 晴光与泡影」打开；本程序不会关闭或重启它。");
                }
            }
            else
            {
                var port = CodexPackage.FindFreePort();
                _ = _package.Launch(LaunchPolicy.AddDebugArguments(_settings.Enabled, alreadyRunning: false) ? port : null);
                _settings = _settings with { LastPort = port };
                _store.Save(_settings);
                Update("waiting-for-codex", port);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch { Update("codex-launch-unavailable", null); Notice?.Invoke("无法启动商店版 Codex。请检查当前 Windows 用户是否已安装 Codex。"); }
        finally { _gate.Release(); Wake(); }
    }

    private async Task ReconcileAsync(CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (_package is null || DateTimeOffset.Now - _packageAt > TimeSpan.FromMinutes(2))
            {
                try { _package = await CodexPackage.DiscoverAsync(token); }
                catch when (!_settings.Enabled && _registrations.Count == 0 && _pages.Values.All(p => p.Restored))
                { token.ThrowIfCancellationRequested(); Update("default", null); return; }
                _packageAt = DateTimeOffset.Now;
            }
            var discovered = new Dictionary<string, (OwnedPort Port, CdpTarget Target)>();
            var failed = false;
            foreach (var port in PortOwnership.Find(_package).OrderByDescending(p => p.Port == _settings.LastPort))
            {
                try
                {
                    foreach (var target in await _discovery.FindAsync(port, _package, token))
                        discovered[$"{port.ProcessId}:{port.Port}:{target.Id}"] = (port, target);
                }
                catch (Exception e) when (e is HttpRequestException or OperationCanceledException or JsonException) { token.ThrowIfCancellationRequested(); }
            }
            foreach (var key in _pages.Keys.Where(k => !discovered.ContainsKey(k) || !_pages[k].Connection.Ready).ToArray())
            {
                var page = _pages[key];
                if (page.Connection.Ready)
                {
                    await RemoveFutureAsync(page, token);
                    if (!_settings.Enabled) await page.Connection.EvaluateAsync(_remove, token);
                }
                await page.Connection.DisposeAsync();
                _pages.Remove(key);
            }
            foreach (var (key, value) in discovered)
            {
                if (!_pages.TryGetValue(key, out var page))
                {
                    var connection = new CdpConnection();
                    try
                    {
                        await connection.ConnectAsync(value.Target.Socket, token);
                        if (!PortOwnership.Find(_package).Contains(value.Port)) throw new InvalidOperationException("port-owner-changed");
                        await connection.SendAsync("Page.enable", new { }, token);
                        page = new(connection, value.Port.ProcessId, value.Port.Port, value.Target.Id);
                        var capturedPage = page;
                        connection.Navigated += () => { capturedPage.Restored = false; capturedPage.BridgeInitialized = false; Wake(); };
                        connection.StartupSettingChanged += value =>
                        {
                            if (StartupSettingsBridge.TryParseChange(value, out var enabled))
                                _ = ReceiveStartupChangeAsync(enabled);
                        };
                        await connection.SendAsync("Runtime.enable", new { }, token);
                        await connection.SendAsync("Runtime.addBinding", new { name = "sunlitTidesStartupChanged" }, token);
                        if (_registrations.TryGetValue(key, out var ids)) page.ScriptIds.AddRange(ids);
                        _pages.Add(key, page);
                        await RemoveFutureAsync(page, token); // Recover registrations left by a crashed earlier helper.
                    }
                    catch { failed = true; _pages.Remove(key); await connection.DisposeAsync(); continue; }
                }
                try
                {
                    await SyncStartupAsync(page, token);
                    if (!_settings.Enabled)
                    {
                        await RemoveFutureAsync(page, token);
                        if (!page.Restored)
                        {
                            await page.Connection.EvaluateAsync(_remove, token);
                            page.Restored = true;
                        }
                        continue;
                    }
                    page.Restored = false;
                    if (page.ScriptIds.Count == 0)
                    {
                        var registration = await page.Connection.SendAsync("Page.addScriptToEvaluateOnNewDocument", new { source = _bootstrap }, token);
                        var id = registration.GetProperty("identifier").GetString() ?? throw new InvalidDataException("registration-invalid");
                        page.ScriptIds.Add(id);
                        _registrations[page.Key] = page.ScriptIds.ToList();
                        SaveRegistrations();
                    }
                    var installed = await page.Connection.EvaluateAsync(_probe, token);
                    if (installed.ValueKind != JsonValueKind.True)
                    {
                        var applied = await page.Connection.EvaluateAsync(_apply, token);
                        if (!applied.TryGetProperty("installed", out var ok) || ok.ValueKind != JsonValueKind.True) throw new InvalidOperationException("acceptance-failed");
                    }
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
                catch { failed = true; }
            }
            // Drop only IDs whose owning process is gone. A surviving process may recreate a target.
            foreach (var key in _registrations.Keys.ToArray())
            {
                if (int.TryParse(key.Split(':')[0], out var pid) && !_package.OwnsProcess(pid)) _registrations.Remove(key);
            }
            SaveRegistrations();
            var first = discovered.Values.FirstOrDefault();
            var portNumber = discovered.Count > 0 ? (int?)first.Port.Port : null;
            if (!_settings.Enabled) Update(_registrations.Count == 0 && !failed ? "default" : "restore-retrying", portNumber);
            else if (discovered.Count == 0) Update(_package.IsRunning() ? "reopen-through-theme-launcher" : "waiting-for-codex", null);
            else Update(failed ? "theme-apply-retrying" : "active", portNumber);
            if (portNumber is { } activePort && _settings.LastPort != activePort)
            {
                _settings = _settings with { LastPort = activePort };
                _store.Save(_settings);
            }
        }
        finally { _gate.Release(); }
    }

    private async Task RemoveFutureAsync(PageSession page, CancellationToken token)
    {
        foreach (var id in page.ScriptIds.ToArray())
        {
            try { await page.Connection.SendAsync("Page.removeScriptToEvaluateOnNewDocument", new { identifier = id }, token); }
            catch (MissingCdpScriptException) { /* The detached earlier session no longer owns this registration. */ }
            page.ScriptIds.Remove(id);
        }
        _registrations.Remove(page.Key);
        SaveRegistrations();
    }

    private async Task RestoreSessionsAsync(CancellationToken token)
    {
        try
        {
            await RestoreOrdering.RunAsync(_pages.Values.ToArray(),
                page => RemoveFutureAsync(page, token),
                async page => { await page.Connection.EvaluateAsync(_remove, token); page.Restored = true; });
        }
        catch { _store.Log("restore-removal-pending"); }
    }

    private void SaveRegistrations()
    {
        Directory.CreateDirectory(StateStore.DataDirectory);
        var target = Path.Combine(StateStore.DataDirectory, "registrations.json");
        File.WriteAllText(target + ".tmp", JsonSerializer.Serialize(_registrations));
        File.Move(target + ".tmp", target, overwrite: true);
    }

    private void Update(string state, int? port)
    {
        var changed = _health.State != state || _health.Enabled != _settings.Enabled || _health.StartupEnabled != _settings.StartupEnabled || _health.Port != port || _health.AttachedPages != _pages.Count;
        _health = new(true, _settings.Enabled, state, _pages.Count, port, DateTimeOffset.Now, StartupEnabled: _settings.StartupEnabled);
        if (!changed) return;
        _store.SaveHealth(_health);
        _store.Log(state);
        Changed?.Invoke(_health);
    }

    private void Wake() { try { _wake.Release(); } catch (SemaphoreFullException) { } catch (ObjectDisposedException) { } }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        await _startup.DisposeAsync();
        if (_loop is not null) try { await _loop; } catch { }
        using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await _gate.WaitAsync();
        try
        {
            await RestoreSessionsAsync(cleanup.Token);
            foreach (var page in _pages.Values)
            {
                if (page.Connection.Ready)
                    try
                    {
                        await page.Connection.EvaluateAsync(StartupSettingsBridge.Remove, cleanup.Token);
                        await page.Connection.SendAsync("Runtime.removeBinding", new { name = "sunlitTidesStartupChanged" }, cleanup.Token);
                    }
                    catch { }
                await page.Connection.DisposeAsync();
            }
            _pages.Clear();
            _store.SaveHealth(new(false, _settings.Enabled, "stopped", 0, null, DateTimeOffset.Now, StartupEnabled: _settings.StartupEnabled));
        }
        finally { _gate.Release(); }
        _discovery.Dispose();
        _stop.Dispose();
        _gate.Dispose();
        _wake.Dispose();
    }
}
