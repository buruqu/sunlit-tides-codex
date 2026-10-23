using System.Runtime.InteropServices;
using System.Text.Json;

namespace SunlitTidesCodex;

internal static class Program
{
    [DllImport("kernel32.dll")] private static extern bool AttachConsole(uint processId);
    [STAThread]
    private static int Main(string[] args)
    {
        var command = args.FirstOrDefault()?.ToLowerInvariant() ?? "--launch";
        if (args.Length > 1 || command is not ("--launch" or "--startup" or "--status" or "--restore" or "--enable" or "--quit" or "--self-test"))
        { Write("{\"ok\":false,\"error\":\"invalid-command\"}"); return 2; }
        if (command == "--self-test") return SelfTests.Run();
        using var mutex = new Mutex(false, SingleInstance.MutexName);
        bool acquired;
        try { acquired = mutex.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
        if (!acquired)
        {
            var request = command switch { "--startup" => "status", _ => command[2..] };
            var response = SingleInstance.SendAsync(request, CancellationToken.None).GetAwaiter().GetResult();
            Write(response ?? "{\"ok\":false,\"error\":\"helper-not-responding\"}");
            if (response is null) return 3;
            try
            {
                using var json = JsonDocument.Parse(response);
                if (json.RootElement.TryGetProperty("error", out _)) return 4;
                if (request is "restore" or "quit" && json.RootElement.GetProperty("state").GetString() != "default") return 4;
                return 0;
            }
            catch { return 4; }
        }
        try
        {
            var store = new StateStore();
            if (command == "--status")
            {
                Write(JsonSerializer.Serialize(new Health(false, store.Read().Enabled, "stopped", 0, null, DateTimeOffset.Now), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
                return 0;
            }
            if (command is "--restore" or "--quit")
            {
                var host = new ThemeHost(store);
                try
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                    var result = host.RestoreOnceAsync(timeout.Token).GetAwaiter().GetResult();
                    Write(JsonSerializer.Serialize(result, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
                    return result.State == "default" ? 0 : 4;
                }
                finally { host.DisposeAsync().AsTask().GetAwaiter().GetResult(); }
            }
            ApplicationConfiguration.Initialize();
            using var app = new TrayContext(store, command);
            Application.Run(app);
            return 0;
        }
        catch
        {
            Write("{\"ok\":false,\"error\":\"host-start-failed\"}");
            return 1;
        }
        finally { mutex.ReleaseMutex(); }
    }

    internal static void Write(string value)
    {
        _ = AttachConsole(uint.MaxValue);
        try { Console.WriteLine(value); } catch (IOException) { }
    }
}

internal sealed class TrayContext : ApplicationContext
{
    private readonly Control _dispatcher = new();
    private readonly NotifyIcon _icon;
    private readonly ThemeHost _host;
    private readonly CancellationTokenSource _stop = new();
    private readonly Task _server;
    private bool _exiting;

    internal TrayContext(StateStore store, string command)
    {
        _ = _dispatcher.Handle;
        _host = new(store);
        var menu = new ContextMenuStrip();
        menu.Items.Add("启用晴光与泡影主题", null, async (_, _) => await RunAction(() => _host.SetEnabledAsync(true, true, _stop.Token)));
        menu.Items.Add("恢复 Codex 默认外观", null, async (_, _) => await RunAction(() => _host.SetEnabledAsync(false, false, _stop.Token)));
        menu.Items.Add("打开 Codex", null, async (_, _) => await RunAction(() => _host.LaunchAsync(_stop.Token)));
        menu.Items.Add("查看状态", null, (_, _) => ShowStatus());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("恢复默认并退出", null, async (_, _) => await QuitAsync());
        _icon = new NotifyIcon { Icon = SystemIcons.Application, Text = "Codex · 晴光与泡影", ContextMenuStrip = menu, Visible = true };
        _icon.DoubleClick += (_, _) => ShowStatus();
        _host.Changed += health => Dispatch(() => _icon.Text = "晴光与泡影 · " + StatusName(health.State));
        _host.Notice += message => Dispatch(() => _icon.ShowBalloonTip(12000, "Codex · 晴光与泡影", message, ToolTipIcon.Info));
        _server = SingleInstance.ServeAsync(HandleAsync, _stop.Token);
        _host.Start(launch: command is "--startup" or "--launch" or "--enable", enable: command is "--launch" or "--enable");
    }

    private async Task RunAction(Func<Task> action)
    {
        try { await action(); }
        catch (OperationCanceledException) { }
        catch { _icon.ShowBalloonTip(5000, "Codex · 晴光与泡影", "操作未完成，请稍后重试或查看状态。", ToolTipIcon.Warning); }
    }

    private async Task<string> HandleAsync(string command)
    {
        try
        {
            switch (command)
            {
                case "restore": await _host.SetEnabledAsync(false, false, _stop.Token); break;
                case "enable": await _host.SetEnabledAsync(true, true, _stop.Token); break;
                case "launch": await _host.SetEnabledAsync(true, true, _stop.Token); break;
                case "quit":
                    await _host.SetEnabledAsync(false, false, _stop.Token);
                    if (_host.Current.State == "default")
                        _ = Task.Run(async () => { await Task.Delay(250); Dispatch(() => _ = QuitAsync()); });
                    break;
            }
            return JsonSerializer.Serialize(_host.Current, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }
        catch { return "{\"ok\":false,\"error\":\"operation-failed\"}"; }
    }

    private void Dispatch(Action action)
    {
        if (!_dispatcher.IsDisposed && !_exiting)
            try { _dispatcher.BeginInvoke(action); } catch (InvalidOperationException) { }
    }

    private void ShowStatus()
    {
        var state = _host.Current;
        MessageBox.Show($"状态：{StatusName(state.State)}\n主题：{(state.Enabled ? "已启用" : "默认外观")}\n已连接页面：{state.AttachedPages}\n本机端口：{state.Port?.ToString() ?? "无"}\n\n原生入口冷启动没有主题连接时，请完成任务后自行退出 Codex，再从主题快捷方式打开。",
            "Codex · 晴光与泡影", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private static string StatusName(string state) => state switch
    {
        "active" => "主题已应用", "default" => "默认外观", "starting" => "正在启动",
        "waiting-for-codex" => "等待 Codex", "reopen-through-theme-launcher" => "请从主题入口重新打开",
        "theme-files-invalid" => "主题文件校验失败", "codex-launch-unavailable" => "无法启动 Codex",
        "theme-apply-retrying" => "正在重试主题", "restore-retrying" => "正在重试恢复", _ => "连接暂不可用"
    };

    private async Task QuitAsync()
    {
        if (_exiting) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        try { await _host.SetEnabledAsync(false, false, timeout.Token); }
        catch { _icon.ShowBalloonTip(8000, "恢复尚未完成", "已关闭自动应用，将保留宿主以继续恢复。请稍后重试退出。", ToolTipIcon.Warning); return; }
        if (_host.Current.State != "default")
        { _icon.ShowBalloonTip(8000, "恢复尚未完成", "将保留宿主继续恢复，避免遗留页面注入。请稍后重试退出。", ToolTipIcon.Warning); return; }
        _exiting = true;
        _stop.Cancel();
        try { await _host.DisposeAsync(); } catch { }
        _icon.Visible = false;
        _icon.Dispose();
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _stop.Cancel();
            _icon.Dispose();
            _dispatcher.Dispose();
            _stop.Dispose();
        }
        base.Dispose(disposing);
    }
}
