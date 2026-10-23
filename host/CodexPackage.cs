using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace SunlitTidesCodex;

internal sealed record CodexPackage(string Aumid, string InstallLocation, string Executable, string Version)
{
    internal static async Task<CodexPackage> DiscoverAsync(CancellationToken token)
    {
        const string query = "$p=Get-AppxPackage OpenAI.Codex|Sort-Object Version -Descending|Select-Object -First 1;" +
            "if(-not $p){throw 'missing'};$m=Get-AppxPackageManifest -Package $p.PackageFullName;" +
            "$a=@($m.Package.Applications.Application)|Where-Object{$_.Executable -match '(ChatGPT|Codex)\\.exe$'}|Select-Object -First 1;" +
            "if(-not $a){throw 'entry'};[pscustomobject]@{aumid=\"$($p.PackageFamilyName)!$($a.Id)\";installLocation=$p.InstallLocation;executable=$a.Executable;version=\"$($p.Version)\"}|ConvertTo-Json -Compress";
        var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"))
        { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", query }) info.ArgumentList.Add(arg);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        using var process = Process.Start(info) ?? throw new InvalidOperationException("package-query");
        var stdout = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var stderr = process.StandardError.ReadToEndAsync(timeout.Token);
        try { await process.WaitForExitAsync(timeout.Token); }
        catch { try { process.Kill(entireProcessTree: true); } catch { } throw; }
        var content = await stdout;
        _ = await stderr;
        if (process.ExitCode != 0) throw new InvalidOperationException("codex-not-installed");
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;
        var location = Path.GetFullPath(root.GetProperty("installLocation").GetString()!);
        var relative = root.GetProperty("executable").GetString()!;
        var exe = Path.GetFullPath(Path.Combine(location, relative));
        if (!exe.StartsWith(location.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || !File.Exists(exe)) throw new InvalidOperationException("package-entry-invalid");
        return new(root.GetProperty("aumid").GetString()!, location, exe, root.GetProperty("version").GetString()!);
    }

    internal bool OwnsProcess(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return string.Equals(process.MainModule?.FileName, Executable, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    internal bool IsRunning()
    {
        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(Executable)))
            using (process) { if (OwnsProcess(process.Id)) return true; }
        return false;
    }

    internal uint Launch(int? port)
    {
        var manager = (IApplicationActivationManager)new ApplicationActivationManager();
        try
        {
            var args = port is { } p ? $"--remote-debugging-address=127.0.0.1 --remote-debugging-port={p}" : "";
            Marshal.ThrowExceptionForHR(manager.ActivateApplication(Aumid, args, 2, out var pid));
            return pid;
        }
        finally { if (Marshal.IsComObject(manager)) Marshal.ReleaseComObject(manager); }
    }

    internal static int FindFreePort()
    {
        for (var p = 9340; p <= 9399; p++)
        {
            TcpListener? listener = null;
            try { listener = new(IPAddress.Loopback, p); listener.Start(); return p; }
            catch (SocketException) { }
            finally { listener?.Stop(); }
        }
        throw new InvalidOperationException("no-free-port");
    }

    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IApplicationActivationManager
    {
        [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string aumid, [MarshalAs(UnmanagedType.LPWStr)] string arguments, int options, out uint processId);
    }
    [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] private class ApplicationActivationManager { }
}

internal sealed record OwnedPort(int Port, int ProcessId);

internal static class PortOwnership
{
    [StructLayout(LayoutKind.Sequential)] private struct Row
    {
        internal uint State, LocalAddress, LocalPort, RemoteAddress, RemotePort, Pid;
    }
    [DllImport("iphlpapi.dll", SetLastError = true)] private static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int family, int tableClass, uint reserved);

    internal static IReadOnlyList<OwnedPort> Find(CodexPackage package)
    {
        var size = 0;
        _ = GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 3, 0); // IPv4, TCP_TABLE_OWNER_PID_LISTENER
        if (size <= 0 || size > 16 * 1024 * 1024) return [];
        var pointer = Marshal.AllocHGlobal(size);
        try
        {
            if (GetExtendedTcpTable(pointer, ref size, false, 2, 3, 0) != 0) return [];
            var count = Marshal.ReadInt32(pointer);
            var rowSize = Marshal.SizeOf<Row>();
            if (count < 0 || 4L + count * rowSize > size) return [];
            var rows = new List<(int Port, int Pid, IPAddress Address)>();
            for (var index = 0; index < count; index++)
            {
                var row = Marshal.PtrToStructure<Row>(IntPtr.Add(pointer, 4 + index * rowSize));
                var port = (ushort)IPAddress.NetworkToHostOrder((short)(row.LocalPort & 0xffff));
                rows.Add((port, checked((int)row.Pid), new IPAddress(row.LocalAddress)));
            }
            // Do not attach if the same PID/port also exposes a non-loopback listener.
            return rows.GroupBy(r => (r.Port, r.Pid))
                .Where(g => g.Key.Port >= 1024 && g.All(r => IPAddress.IsLoopback(r.Address)) && package.OwnsProcess(g.Key.Pid))
                .Select(g => new OwnedPort(g.Key.Port, g.Key.Pid)).ToArray();
        }
        finally { Marshal.FreeHGlobal(pointer); }
    }
}
