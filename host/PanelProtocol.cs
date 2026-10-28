using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace SunlitTidesCodex;

internal static class PanelProtocol
{
    internal const int MaxMessage = 24 * 1024 * 1024;
    internal static string Text(JsonElement message, string name) => message.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
    internal static int Number(JsonElement message, string name, int fallback = 0) => message.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var n) && double.IsFinite(n) ? (int)Math.Clamp(n, int.MinValue, int.MaxValue) : fallback;
    internal static bool Valid(JsonElement message)
    {
        if (message.ValueKind != JsonValueKind.Object) return false;
        var session = Text(message, "session");
        if (session.Length is < 8 or > 100 || session.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_')) return false;
        if (Text(message, "type") is not ("open" or "update" or "close" or "pick-file" or "file-ack")) return false;
        foreach (var field in new[] { "revision", "width", "height", "screenX", "screenY", "offsetX", "offsetY", "index", "ownerPid" })
            if (message.TryGetProperty(field, out var number) && (number.ValueKind != JsonValueKind.Number || !number.TryGetDouble(out var n) || !double.IsFinite(n))) return false;
        if (Text(message, "html").Length > 20 * 1024 * 1024 || Text(message, "css").Length > 1024 * 1024) return false;
        return true;
    }
    internal static int RunStdio()
    {
        ApplicationConfiguration.Initialize();
        using var manager = new PanelManager();
        var outputLock = new object();
        void Output(string json) { lock (outputLock) { Console.Out.WriteLine(json); Console.Out.Flush(); } }
        // Bounded line reader: ReadLine would allocate unbounded data before validation.
        var line = new System.Text.StringBuilder();
        int ch;
        while ((ch = Console.In.Read()) >= 0)
        {
            if (ch == '\n')
            {
                try
                {
                    using var document = JsonDocument.Parse(line.ToString());
                    var pid = document.RootElement.TryGetProperty("ownerPid", out var ownerPid) && ownerPid.TryGetInt32(out var integerPid) ? integerPid : 0;
                    var owner = PanelNative.FindOwner(pid, Text(document.RootElement, "ownerHwnd"), document.RootElement);
                    manager.Request("stdio", document.RootElement.Clone(), owner, Output);
                }
                catch { Output("{\"type\":\"error\",\"error\":\"invalid-request\"}"); }
                line.Clear();
            }
            else if (line.Length >= MaxMessage) return 2;
            else line.Append((char)ch);
        }
        return 0;
    }
}

internal static class PanelNative
{
    internal delegate bool WindowCallback(IntPtr window, IntPtr state);
    [StructLayout(LayoutKind.Sequential)] internal struct Rect { internal int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] internal struct Point { internal int X, Y; }
    [DllImport("user32.dll")] internal static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] internal static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] internal static extern bool GetClientRect(IntPtr window, out Rect rectangle);
    [DllImport("user32.dll")] internal static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct ProcessEntry
    {
        internal uint Size, Usage, Pid; internal UIntPtr Heap; internal uint Module, Threads, ParentPid; internal int Priority; internal uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] internal string Name;
    }
    [DllImport("kernel32.dll")] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32FirstW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool Process32NextW(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] internal static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    internal static IntPtr FindOwner(int pid, string requested = "", JsonElement hints = default)
    {
        try { using var p = Process.GetProcessById(pid); if (p.SessionId != Process.GetCurrentProcess().SessionId) return IntPtr.Zero; }
        catch { return IntPtr.Zero; }
        if (long.TryParse(requested, out var handle))
        {
            var window = new IntPtr(handle); GetWindowThreadProcessId(window, out var actual);
            return IsWindow(window) && actual == pid ? window : IntPtr.Zero;
        }
        IntPtr Pick(int processId)
        {
            var candidates = new List<IntPtr>();
            EnumWindows((w, _) => { GetWindowThreadProcessId(w, out var p); if (p == processId && IsWindowVisible(w) && !IsIconic(w) && GetWindow(w, 4) == IntPtr.Zero) candidates.Add(w); return true; }, IntPtr.Zero);
            return SelectOwner(candidates, hints);
        }
        var result = Pick(pid);
        if (result != IntPtr.Zero) return result;
        // A DSH plugin backend can be a Node child. Only walk its actual parent
        // chain; never guess an owner from window titles or the foreground app.
        var snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new IntPtr(-1)) return IntPtr.Zero;
        var parents = new Dictionary<int, int>();
        try
        {
            var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf<ProcessEntry>(), Name = "" };
            if (Process32FirstW(snapshot, ref entry)) do { parents[(int)entry.Pid] = (int)entry.ParentPid; } while (Process32NextW(snapshot, ref entry));
        }
        finally { CloseHandle(snapshot); }
        var seen = new HashSet<int> { pid };
        for (var depth = 0; depth < 8 && parents.TryGetValue(pid, out var parent) && parent > 0 && seen.Add(parent); depth++)
        {
            try
            {
                using var childProcess = Process.GetProcessById(pid); using var parentProcess = Process.GetProcessById(parent);
                if (parentProcess.SessionId != childProcess.SessionId || parentProcess.StartTime > childProcess.StartTime) return IntPtr.Zero;
            }
            catch { return IntPtr.Zero; }
            pid = parent;
            result = Pick(pid);
            if (result != IntPtr.Zero) return result;
        }
        return IntPtr.Zero;
    }
    private static IntPtr SelectOwner(List<IntPtr> candidates, JsonElement hints)
    {
        GetCursorPos(out var cursor);
        var viewport = hints.ValueKind == JsonValueKind.Object && hints.TryGetProperty("viewport", out var v) && v.ValueKind == JsonValueKind.Object ? v : default;
        var hasViewport = viewport.ValueKind == JsonValueKind.Object && PanelProtocol.Number(viewport, "width") > 0 && PanelProtocol.Number(viewport, "height") > 0;
        double Score(IntPtr window)
        {
            if (!GetClientRect(window, out var rect) || rect.Right <= 0 || rect.Bottom <= 0) return double.MaxValue;
            var origin = new Point(); ClientToScreen(window, ref origin);
            if (hasViewport)
            {
                var scale = Math.Max(96, GetDpiForWindow(window)) / 96.0;
                // Page coordinates are selection hints only. The candidate set is
                // still restricted to the verified process and its parent chain.
                var dx = origin.X / scale - PanelProtocol.Number(viewport, "left");
                var dy = origin.Y / scale - PanelProtocol.Number(viewport, "top");
                var dw = rect.Right / scale - PanelProtocol.Number(viewport, "width");
                var dh = rect.Bottom / scale - PanelProtocol.Number(viewport, "height");
                return dx * dx + dy * dy + dw * dw + dh * dh;
            }
            var x = Math.Max(origin.X - cursor.X, Math.Max(0, cursor.X - origin.X - rect.Right));
            var y = Math.Max(origin.Y - cursor.Y, Math.Max(0, cursor.Y - origin.Y - rect.Bottom));
            return (double)x * x + (double)y * y;
        }
        return candidates.OrderBy(Score).FirstOrDefault();
    }
    internal static bool Inside(IntPtr owner, Point cursor)
    {
        if (!GetClientRect(owner, out var rect)) return false;
        var origin = new Point(); ClientToScreen(owner, ref origin);
        return cursor.X >= origin.X && cursor.X < origin.X + rect.Right && cursor.Y >= origin.Y && cursor.Y < origin.Y + rect.Bottom;
    }
}
