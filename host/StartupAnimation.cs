using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using WpfWindow = System.Windows.Window;
using WpfButton = System.Windows.Controls.Button;
using WpfCheckBox = System.Windows.Controls.CheckBox;
using Brushes = System.Windows.Media.Brushes;

namespace SunlitTidesCodex;

internal sealed record GuiInstance(int Pid, long StartedUtcTicks, IntPtr Window)
{
    internal string Identity => $"{Pid}:{StartedUtcTicks}";
}

// The process creation time prevents PID reuse from suppressing a later real launch.
// Existing processes are seeded even if they have not created a visible window yet.
internal sealed class StartupPlaybackPolicy(DateTimeOffset hostStarted)
{
    private readonly HashSet<string> _consumed = [];
    internal bool Observe(GuiInstance instance, bool enabled)
    {
        if (instance.StartedUtcTicks <= hostStarted.UtcTicks) { _consumed.Add(instance.Identity); return false; }
        if (instance.Window == IntPtr.Zero) return false;
        if (!_consumed.Add(instance.Identity)) return false;
        return enabled;
    }
}

internal sealed class StartupWatcher(Func<CodexPackage?> package, Func<bool> enabled) : IAsyncDisposable
{
    private readonly StartupPlaybackPolicy _policy = new(DateTimeOffset.UtcNow);
    private readonly CancellationTokenSource _stop = new();
    private Task? _loop;
    internal event Action<IntPtr>? Play;
    internal void Start() => _loop = Task.Run(async () =>
    {
        while (!_stop.IsCancellationRequested)
        {
            try
            {
                if (package() is { } current)
                    foreach (var instance in Find(current))
                        if (_policy.Observe(instance, enabled())) Play?.Invoke(instance.Window);
            }
            catch { /* A closing or inaccessible process is simply retried on the next tick. */ }
            try { await Task.Delay(TimeSpan.FromSeconds(1), _stop.Token); }
            catch (OperationCanceledException) { break; }
        }
    });

    internal static IReadOnlyList<GuiInstance> Find(CodexPackage package)
    {
        var processes = new Dictionary<int, long>();
        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(package.Executable)))
            using (process)
            {
                try
                {
                    // Exact MSIX manifest executable identity; never attach by name or title alone.
                    if (package.OwnsProcess(process.Id)) processes[process.Id] = process.StartTime.ToUniversalTime().Ticks;
                }
                catch { }
            }
        var windows = new Dictionary<int, IntPtr>();
        EnumWindows((window, state) =>
        {
            _ = GetWindowThreadProcessId(window, out var pid);
            if (!processes.ContainsKey((int)pid) || !IsWindowVisible(window) || GetWindow(window, 4) != IntPtr.Zero) return true;
            var className = new StringBuilder(100);
            _ = GetClassName(window, className, className.Capacity);
            // Chromium GUI windows only. Renderers, consoles and helper processes cannot trigger playback.
            if (className.ToString() != "Chrome_WidgetWin_1" || GetWindowTextLength(window) == 0) return true;
            if ((GetWindowLongPtr(window, -20).ToInt64() & 0x80) != 0) return true; // WS_EX_TOOLWINDOW
            windows.TryAdd((int)pid, window);
            return true;
        }, IntPtr.Zero);
        return processes.Select(p => new GuiInstance(p.Key, p.Value, windows.GetValueOrDefault(p.Key))).ToArray();
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        if (_loop is not null) await _loop;
        _stop.Dispose();
    }
    private delegate bool WindowCallback(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder text, int maximum);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
}

internal static class StartupSettingsBridge
{
    internal const string Read = "(()=>{try{return localStorage.getItem('sunlit-tides.startup.enabled')}catch{return null}})()";
    internal static bool TryParseChange(string value, out bool enabled)
    {
        enabled = false;
        try
        {
            using var json = JsonDocument.Parse(value);
            if (json.RootElement.ValueKind != JsonValueKind.Object || !json.RootElement.TryGetProperty("enabled", out var property) || property.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
            enabled = property.GetBoolean();
            return true;
        }
        catch (JsonException) { return false; }
    }
    internal static string Publish(bool enabled) => ScriptBuilder.Read("startup-state.js").Replace("%%ENABLED%%", enabled ? "true" : "false");
    internal static string Remove => ScriptBuilder.Read("startup-remove.js");
}

internal sealed class StartupAnimationWindow : WpfWindow
{
    private readonly MediaElement _media;
    private readonly DispatcherTimer _timeout;
    private readonly DispatcherTimer _openTimeout;
    private bool _fading;
    internal StartupAnimationWindow(string video, IntPtr target, bool enabled, Action<bool> save, Action<string> log)
    {
        Title = "Codex · 晴光与泡影 — Dragon";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        var foreground = GetForegroundWindow();
        // A delayed detection must not interrupt a user who has switched to another app.
        // Escape belongs to the player when it is active; never register a global hook.
        ShowActivated = target == IntPtr.Zero || foreground == target || GetAncestor(foreground, 3) == target;
        ShowInTaskbar = false;
        Topmost = false; // Ownership keeps the player over Codex without covering another selected app.
        if (target != IntPtr.Zero && IsWindow(target)) new WindowInteropHelper(this).Owner = target;
        Background = Brushes.Black;
        var screen = target != IntPtr.Zero ? Screen.FromHandle(target) : Screen.PrimaryScreen!;
        // WPF uses logical units while the Win32 screen bounds are physical pixels.
        var dpi = target != IntPtr.Zero ? Math.Max(96u, GetDpiForWindow(target)) / 96d : 1d;
        Width = Math.Min(1100, screen.WorkingArea.Width * .9 / dpi);
        Height = Width * 9 / 16 + 48;
        if (Height > screen.WorkingArea.Height * .9 / dpi) { Height = screen.WorkingArea.Height * .9 / dpi; Width = (Height - 48) * 16 / 9; }
        Left = (screen.WorkingArea.Left + screen.WorkingArea.Width / 2d) / dpi - Width / 2;
        Top = (screen.WorkingArea.Top + screen.WorkingArea.Height / 2d) / dpi - Height / 2;
        var grid = new Grid();
        grid.RowDefinitions.Add(new RowDefinition());
        grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
        _media = new MediaElement { LoadedBehavior = MediaState.Manual, UnloadedBehavior = MediaState.Close, Stretch = Stretch.Uniform, Volume = .6 };
        grid.Children.Add(_media);
        var controls = new DockPanel { Margin = new Thickness(16, 7, 12, 7), LastChildFill = false };
        var skip = new WpfButton { Content = "跳过 · Esc", MinWidth = 100, Padding = new Thickness(12, 3, 12, 3) };
        DockPanel.SetDock(skip, Dock.Right);
        skip.Click += (_, _) => Close();
        controls.Children.Add(skip);
        var toggle = new WpfCheckBox { Content = "以后启动时播放", IsChecked = enabled, Foreground = Brushes.White, VerticalAlignment = VerticalAlignment.Center };
        toggle.Click += (_, _) => save(toggle.IsChecked == true);
        controls.Children.Add(toggle);
        Grid.SetRow(controls, 1);
        grid.Children.Add(controls);
        Content = grid;
        PreviewKeyDown += (_, args) => { if (args.Key == Key.Escape) { args.Handled = true; Close(); } };
        _timeout = new DispatcherTimer { Interval = TimeSpan.FromSeconds(25) };
        _timeout.Tick += (_, _) => { log("startup-timeout"); Close(); };
        _openTimeout = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
        _openTimeout.Tick += (_, _) => { log("startup-open-timeout"); Close(); };
        _media.MediaOpened += (_, _) => { log("startup-opened"); _openTimeout.Stop(); };
        _media.MediaEnded += (_, _) => { log("startup-ended"); FadeOut(); };
        _media.MediaFailed += (_, _) => { log("startup-media-failed"); Close(); };
        Loaded += (_, _) =>
        {
            _timeout.Start(); _openTimeout.Start();
            try { _media.Source = new Uri(video); _media.Play(); }
            catch { log("startup-media-failed"); Close(); }
        };
        var returnFocus = false;
        _ = GetWindowThreadProcessId(target, out var targetPid);
        Closing += (_, _) => returnFocus = GetForegroundWindow() == new WindowInteropHelper(this).Handle;
        Closed += (_, _) =>
        {
            _timeout.Stop(); _openTimeout.Stop(); _media.Close();
            log("startup-closed");
            // If the user switched to another application, leave that application in front.
            if (returnFocus && target != IntPtr.Zero && IsWindow(target) && IsWindowVisible(target))
            {
                _ = GetWindowThreadProcessId(target, out var currentPid);
                if (targetPid == currentPid) _ = SetForegroundWindow(target);
            }
        };
    }
    private void FadeOut()
    {
        if (_fading) return;
        _fading = true;
        var fade = new DoubleAnimation(0, TimeSpan.FromMilliseconds(300));
        fade.Completed += (_, _) => Close();
        BeginAnimation(OpacityProperty, fade);
    }
    internal static bool ValidVideo(string path)
    {
        try { return File.Exists(path) && new FileInfo(path).Length is > 0 and <= 100 * 1024 * 1024; }
        catch { return false; }
    }
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
