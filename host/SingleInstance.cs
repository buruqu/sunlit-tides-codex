using System.IO.Pipes;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace SunlitTidesCodex;

internal static class HostCommands
{
    internal static bool IsIpc(string command) => command is "status" or "restore" or "enable" or "launch" or "quit" or "preview-startup";
    internal static bool TryParseCli(string command, out string request)
    {
        request = "";
        if (command == "--self-test") return true;
        if (command == "--startup") { request = "status"; return true; }
        if (!command.StartsWith("--", StringComparison.Ordinal) || !IsIpc(command[2..])) return false;
        request = command[2..];
        return true;
    }
}

internal static class SingleInstance
{
    private static string Scope => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(WindowsIdentity.GetCurrent().User?.Value ?? Environment.UserName)))[..24];
    internal static string MutexName => @"Local\SunlitTidesCodex-" + Scope;
    private static string PipeName => "SunlitTidesCodex-" + Scope;

    internal static async Task<string?> SendAsync(string command, CancellationToken token)
    {
        try
        {
            using var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeout.CancelAfter(TimeSpan.FromSeconds(35));
            await pipe.ConnectAsync(5000, timeout.Token);
            using var reader = new StreamReader(pipe, Encoding.UTF8, false, 1024, leaveOpen: true);
            using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, leaveOpen: true) { AutoFlush = true };
            await writer.WriteLineAsync(command.AsMemory(), timeout.Token);
            return await reader.ReadLineAsync(timeout.Token);
        }
        catch (Exception e) when (e is IOException or TimeoutException or OperationCanceledException) { return null; }
    }

    internal static async Task ServeAsync(Func<string, Task<string>> handler, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await server.WaitForConnectionAsync(token);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                timeout.CancelAfter(TimeSpan.FromSeconds(35));
                // Read at most 32 characters; reject oversized/unknown IPC requests.
                var request = new List<byte>();
                var one = new byte[1];
                while (request.Count <= 32 && await server.ReadAsync(one, timeout.Token) == 1 && one[0] != '\n') request.Add(one[0]);
                var command = Encoding.UTF8.GetString(request.ToArray()).Trim();
                var result = request.Count <= 32 && HostCommands.IsIpc(command)
                    ? await handler(command) : "{\"ok\":false,\"error\":\"invalid-command\"}";
                var bytes = Encoding.UTF8.GetBytes(result + "\n");
                await server.WriteAsync(bytes, timeout.Token);
                await server.FlushAsync(timeout.Token);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
            catch (Exception e) when (e is IOException or OperationCanceledException or InvalidOperationException) { }
        }
    }
}
