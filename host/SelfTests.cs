using System.Text.Json;

namespace SunlitTidesCodex;

internal static class LaunchPolicy
{
    internal static bool AddDebugArguments(bool enabled, bool alreadyRunning) => enabled && !alreadyRunning;
}

internal static class RestoreOrdering
{
    internal static async Task RunAsync<T>(IReadOnlyList<T> pages, Func<T, Task> removeFuture, Func<T, Task> removeLive)
    {
        foreach (var page in pages) await removeFuture(page);
        foreach (var page in pages) await removeLive(page);
    }
}

internal static class SelfTests
{
    internal static int Run()
    {
        var count = 0;
        void Assert(bool condition, string name) { if (!condition) throw new InvalidOperationException(name); count++; }
        try
        {
            Assert(TargetValidation.IsPage("page", "app://-/index.html"), "main-page");
            Assert(TargetValidation.IsPage("page", "app://-/index.html?initialRoute=home"), "navigation-page");
            Assert(!TargetValidation.IsPage("page", "https://chatgpt.com/index.html"), "reject-web");
            Assert(!TargetValidation.IsPage("page", "app://example/index.html"), "reject-other-app");
            Assert(!TargetValidation.IsPage("page", "app://-/avatar-overlay.html"), "reject-overlay");
            Assert(!TargetValidation.IsPage("page", "app://-/index.html?initialRoute=%2Favatar-overlay"), "reject-query-overlay");
            Assert(!TargetValidation.IsPage("page", "app://-/index.html?initialRoute=/avatar-overlay"), "reject-plain-query-overlay");
            Assert(!TargetValidation.IsPage("iframe", "app://-/index.html"), "reject-iframe");
            Assert(!TargetValidation.IsPage("page", "app://-/index.html.evil"), "reject-suffix");
            Assert(TargetValidation.IsSocket("ws://127.0.0.1:9340/devtools/page/ABC", 9340), "loopback-socket");
            Assert(TargetValidation.IsSocket("ws://[::1]:9340/devtools/page/ABC", 9340), "ipv6-loopback");
            Assert(!TargetValidation.IsSocket("ws://127.0.0.1:9341/devtools/page/ABC", 9340), "reject-other-port");
            Assert(!TargetValidation.IsSocket("ws://127.0.0.1.evil:9340/devtools/page/ABC", 9340), "reject-hostname");
            Assert(!TargetValidation.IsSocket("ws://10.0.0.1:9340/devtools/page/ABC", 9340), "reject-lan");
            Assert(!TargetValidation.IsSocket("ws://user@127.0.0.1:9340/devtools/page/ABC", 9340), "reject-credentials");
            Assert(!TargetValidation.IsSocket("ws://127.0.0.1:9340/devtools/browser/ABC", 9340), "reject-browser");
            Assert(LaunchPolicy.AddDebugArguments(true, false), "cold-theme-launch");
            Assert(!LaunchPolicy.AddDebugArguments(true, true), "never-relaunch-running-app");
            Assert(!LaunchPolicy.AddDebugArguments(false, false), "default-mode-no-debug");
            var disabled = new Settings(true, 9340) with { Enabled = false };
            var restored = JsonSerializer.Deserialize<Settings>(JsonSerializer.Serialize(disabled));
            Assert(restored is { Enabled: false, LastPort: 9340 }, "restore-state-roundtrip");
            var scripts = ScriptBuilder.Build("Promise.resolve({installed:true,themeId:'sunlit-tides.codex'})", "Promise.resolve(true)", new string('a', 64));
            Assert(!scripts.Apply.Contains("%%") && !scripts.Bootstrap.Contains("%%") && !scripts.Remove.Contains("%%") && !scripts.Probe.Contains("%%"), "embedded-script-contract");
            var operations = new List<string>();
            RestoreOrdering.RunAsync(new[] { "A", "B" }, p => { operations.Add("future:" + p); return Task.CompletedTask; }, p => { operations.Add("live:" + p); return Task.CompletedTask; }).GetAwaiter().GetResult();
            Assert(operations.SequenceEqual(new[] { "future:A", "future:B", "live:A", "live:B" }), "future-removed-before-any-live-runtime");
            operations.Clear();
            try { RestoreOrdering.RunAsync(new[] { "A", "B" }, p => p == "B" ? Task.FromException(new IOException()) : Task.CompletedTask, p => { operations.Add(p); return Task.CompletedTask; }).GetAwaiter().GetResult(); } catch (IOException) { }
            Assert(operations.Count == 0, "future-failure-preserves-live-until-retry");
            Program.Write(JsonSerializer.Serialize(new { ok = true, tests = count, scope = "offline-policy-only" }));
            return 0;
        }
        catch { Program.Write("{\"ok\":false,\"error\":\"self-test-failed\"}"); return 1; }
    }
}
