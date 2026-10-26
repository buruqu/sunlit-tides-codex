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
    private readonly DispatcherTimer _placementTimer;
    private readonly IntPtr _target;
    private readonly uint _targetPid;
    private readonly Action<string> _log;
    private HwndSource? _source;
    private IntPtr _handle;
    private StartupPixelRect? _lastPlacement;
    private StartupPixelRect? _previewPlacement;
    private uint _lastDpi;
    private bool _closed;
    private bool _placementQueued;
    private bool _fading;

    internal StartupAnimationWindow(string video, IntPtr target, bool enabled, Action<bool> save, Action<string> log)
    {
        _target = target;
        _log = log;
        _ = GetWindowThreadProcessId(target, out _targetPid);
        Title = "Codex · 晴光与泡影 — Dragon";
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.Manual;
        // These are only hidden-HWND defaults; native placement below owns the
        // actual physical frame before Show and throughout playback.
        Width = 960;
        Height = 540;
        var foreground = GetForegroundWindow();
        ShowActivated = target == IntPtr.Zero || foreground == target || GetAncestor(foreground, 3) == target;
        ShowInTaskbar = false;
        Topmost = false;
        Background = Brushes.Black;
        var grid = new Grid { ClipToBounds = true };
        _media = new MediaElement
        {
            LoadedBehavior = MediaState.Manual, UnloadedBehavior = MediaState.Close,
            Stretch = Stretch.UniformToFill, Volume = .6
        };
        grid.Children.Add(_media);
        var controls = new DockPanel { LastChildFill = false };
        var skip = new WpfButton { Content = "跳过 · Esc", MinWidth = 100, Padding = new Thickness(12, 3, 12, 3) };
        DockPanel.SetDock(skip, Dock.Right);
        skip.Click += (_, _) => Close();
        controls.Children.Add(skip);
        var toggle = new WpfCheckBox { Content = "以后启动时播放", IsChecked = enabled, Foreground = Brushes.White, VerticalAlignment = VerticalAlignment.Center };
        toggle.Click += (_, _) => save(toggle.IsChecked == true);
        controls.Children.Add(toggle);
        // Controls overlay the video; no reserved 48px row changes its viewport.
        grid.Children.Add(new Border
        {
            Child = controls, VerticalAlignment = VerticalAlignment.Bottom,
            Padding = new Thickness(16, 10, 12, 10),
            Background = new SolidColorBrush(System.Windows.Media.Color.FromArgb(190, 13, 15, 22))
        });
        Content = grid;
        PreviewKeyDown += (_, args) => { if (args.Key == Key.Escape) { args.Handled = true; Close(); } };
        _timeout = new DispatcherTimer { Interval = TimeSpan.FromSeconds(25) };
        _timeout.Tick += (_, _) => { log("startup-timeout"); Close(); };
        _openTimeout = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
        _openTimeout.Tick += (_, _) => { log("startup-open-timeout"); Close(); };
        // This short-lived timer follows only the supplied HWND. It never moves
        // Codex, changes z-order, or activates an application.
        _placementTimer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(33) };
        _placementTimer.Tick += (_, _) => SynchronizePlacement();
        _media.MediaOpened += (_, _) => { log("startup-opened"); _openTimeout.Stop(); };
        _media.MediaEnded += (_, _) => { log("startup-ended"); FadeOut(); };
        _media.MediaFailed += (_, _) => { log("startup-media-failed"); Close(); };
        SourceInitialized += (_, _) =>
        {
            _handle = new WindowInteropHelper(this).Handle;
            _source = HwndSource.FromHwnd(_handle);
            _source?.AddHook(WindowMessage);
            SynchronizePlacement(true);
        };
        Loaded += (_, _) =>
        {
            if (_closed || !SynchronizePlacement(true)) return;
            _placementTimer.Start(); _timeout.Start(); _openTimeout.Start();
            log(target == IntPtr.Zero ? "startup-preview-fallback" : "startup-follow-target");
            try { _media.Source = new Uri(video); _media.Play(); }
            catch { log("startup-media-failed"); Close(); }
        };
        var returnFocus = false;
        Closing += (_, _) => returnFocus = GetForegroundWindow() == _handle;
        Closed += (_, _) =>
        {
            _closed = true;
            _placementTimer.Stop(); _timeout.Stop(); _openTimeout.Stop();
            if (_source is { IsDisposed: false }) _source.RemoveHook(WindowMessage);
            _source = null;
            _media.Close();
            log("startup-closed");
            // Leave another selected app alone, and never restore a minimized target.
            if (returnFocus && target != IntPtr.Zero && IsWindow(target) && IsWindowVisible(target) && !IsIconic(target))
            {
                _ = GetWindowThreadProcessId(target, out var currentPid);
                if (_targetPid == currentPid) _ = SetForegroundWindow(target);
            }
        };
        // HWND creation and native bounds queries use the same physical-pixel
        // coordinate space even when the tray thread was created on another DPI.
        using var awareness = PerMonitorScope.Enter();
        var interop = new WindowInteropHelper(this);
        if (target != IntPtr.Zero && IsWindow(target)) interop.Owner = target;
        _ = interop.EnsureHandle();
    }

    private IntPtr WindowMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        // Let WPF process WM_DPICHANGED first, then enforce the target's exact
        // physical frame instead of retaining the suggested logical-size frame.
        if (message == 0x007E) _previewPlacement = null;
        if (message is 0x02E0 or 0x007E && !_closed && !_placementQueued)
        {
            _placementQueued = true;
            _ = Dispatcher.BeginInvoke(DispatcherPriority.Render, new Action(() =>
            {
                _placementQueued = false;
                if (!_closed) SynchronizePlacement(true);
            }));
        }
        return IntPtr.Zero;
    }

    private bool SynchronizePlacement(bool force = false)
    {
        if (_closed || _handle == IntPtr.Zero) return false;
        using var awareness = PerMonitorScope.Enter();
        StartupPixelRect? frame;
        if (_target == IntPtr.Zero) frame = _previewPlacement ??= PreviewFrame();
        else
        {
            _ = GetWindowThreadProcessId(_target, out var currentPid);
            if (!IsWindow(_target) || currentPid != _targetPid) return EndForTarget("startup-target-closed");
            if (IsIconic(_target)) return EndForTarget("startup-target-minimized");
            if (!IsWindowVisible(_target)) return EndForTarget("startup-target-hidden");
            StartupPixelRect? visible = null, window = null;
            if (DwmGetWindowAttribute(_target, 9, out var extended, Marshal.SizeOf<NativeRect>()) == 0) visible = extended.Pixels;
            if (GetWindowRect(_target, out var bounds)) window = bounds.Pixels;
            frame = StartupWindowGeometry.SelectVisibleFrame(visible, window);
        }
        if (frame is not { } rectangle) return EndForTarget("startup-target-bounds-failed");
        var dpi = GetDpiForWindow(_handle);
        if (!force && rectangle == _lastPlacement && dpi == _lastDpi) return true;
        // SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER. HWND_TOPMOST is never used.
        if (!SetWindowPos(_handle, IntPtr.Zero, rectangle.Left, rectangle.Top, rectangle.Width, rectangle.Height, 0x0214))
            return EndForTarget("startup-placement-failed");
        _lastPlacement = rectangle; _lastDpi = GetDpiForWindow(_handle);
        return true;
    }

    private bool EndForTarget(string reason) { _log(reason); Close(); return false; }

    private static StartupPixelRect PreviewFrame()
    {
        _ = GetCursorPos(out var point);
        var monitor = MonitorFromPoint(point, 2);
        var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        var work = GetMonitorInfo(monitor, ref info) ? info.Work.Pixels : new StartupPixelRect(0, 0, 960, 540);
        return StartupWindowGeometry.PreviewFrame(work);
    }

    private void FadeOut()
    {
        if (_fading || _closed) return;
        _fading = true;
        var fade = new DoubleAnimation(0, TimeSpan.FromMilliseconds(300));
        fade.Completed += (_, _) => { if (!_closed) Close(); };
        BeginAnimation(OpacityProperty, fade);
    }
    internal static bool ValidVideo(string path)
    {
        try { return File.Exists(path) && new FileInfo(path).Length is > 0 and <= 100 * 1024 * 1024; }
        catch { return false; }
    }

    private sealed class PerMonitorScope : IDisposable
    {
        private readonly IntPtr _previous;
        private PerMonitorScope(IntPtr previous) => _previous = previous;
        internal static PerMonitorScope Enter() => new(SetThreadDpiAwarenessContext(new IntPtr(-4)));
        public void Dispose() { if (_previous != IntPtr.Zero) _ = SetThreadDpiAwarenessContext(_previous); }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left, Top, Right, Bottom;
        internal readonly StartupPixelRect Pixels => new(Left, Top, Right, Bottom);
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo { public int Size; public NativeRect Monitor, Work; public uint Flags; }
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out NativeRect value, int size);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out NativePoint value);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(NativePoint value, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo value);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
