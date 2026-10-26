using System.Text.Json;

namespace SunlitTidesCodex;

internal static class LaunchPolicy
{
    internal static bool AddDebugArguments(bool enabled, bool alreadyRunning) => enabled && !alreadyRunning;
    internal static bool ShouldLaunch(bool requested, bool enabled, bool explicitOpen) => requested && (enabled || explicitOpen);
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
            Assert(LaunchPolicy.ShouldLaunch(true, false, true), "ordinary-open-preserves-disabled-choice-and-still-opens-app");
            Assert(!LaunchPolicy.ShouldLaunch(true, false, false), "disabled-login-does-not-open-app");
            Assert(LaunchPolicy.ShouldLaunch(true, true, false), "enabled-login-opens-themed-app");
            Assert(!LaunchPolicy.ShouldLaunch(false, true, true), "no-unrequested-launch");
            var disabled = new Settings(true, 9340) with { Enabled = false };
            var restored = JsonSerializer.Deserialize<Settings>(JsonSerializer.Serialize(disabled));
            Assert(restored is { Enabled: false, LastPort: 9340 }, "restore-state-roundtrip");
            Assert(JsonSerializer.Deserialize<Settings>("{\"Enabled\":true,\"LastPort\":9340}") is { StartupEnabled: true }, "legacy-settings-default-startup-enabled");
            Assert(JsonSerializer.Deserialize<Settings>(JsonSerializer.Serialize(new Settings(StartupEnabled: false))) is { StartupEnabled: false }, "startup-off-persists");
            Assert(StartupSettingsBridge.TryParseChange("{\"enabled\":false}", out var startup) && !startup, "startup-binding-false");
            Assert(StartupSettingsBridge.TryParseChange("{\"enabled\":true}", out startup) && startup, "startup-binding-true");
            Assert(!StartupSettingsBridge.TryParseChange("{\"enabled\":\"false\"}", out _) && !StartupSettingsBridge.TryParseChange("invalid", out _), "startup-binding-rejects-invalid");
            Assert(!StartupSettingsBridge.TryParseChange("[true]", out _) && !StartupSettingsBridge.TryParseChange("null", out _), "startup-binding-rejects-nonobject");
            var began = DateTimeOffset.UtcNow;
            var playback = new StartupPlaybackPolicy(began);
            Assert(!playback.Observe(new(1, began.AddSeconds(-2).UtcTicks, new IntPtr(10)), true), "helper-upgrade-no-existing-app-playback");
            Assert(!playback.Observe(new(2, began.AddSeconds(-1).UtcTicks, IntPtr.Zero), true), "existing-hidden-process-baseline");
            Assert(!playback.Observe(new(2, began.AddSeconds(-1).UtcTicks, new IntPtr(20)), true), "existing-window-appears-no-replay");
            Assert(!playback.Observe(new(3, began.AddSeconds(1).UtcTicks, IntPtr.Zero), true), "new-process-waits-for-visible-gui");
            Assert(playback.Observe(new(3, began.AddSeconds(1).UtcTicks, new IntPtr(30)), true), "normal-new-gui-startup-plays");
            Assert(!playback.Observe(new(3, began.AddSeconds(1).UtcTicks, new IntPtr(31)), true), "second-window-no-replay");
            Assert(playback.Observe(new(3, began.AddSeconds(2).UtcTicks, new IntPtr(32)), true), "pid-reuse-is-new-startup");
            Assert(!playback.Observe(new(4, began.AddSeconds(3).UtcTicks, new IntPtr(40)), false), "toggle-off-skips");
            Assert(!playback.Observe(new(4, began.AddSeconds(3).UtcTicks, new IntPtr(40)), true), "toggle-on-does-not-replay-existing-app");
            Assert(!StartupAnimationWindow.ValidVideo(Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".mp4")), "missing-video-does-not-block-app");
            Assert(!StartupSettingsBridge.Publish(false).Contains("%%") && StartupSettingsBridge.Publish(false).Contains("const enabled = false;"), "startup-script-embedded");
            foreach (var cli in new[] { "--launch", "--open", "--startup", "--watch", "--status", "--restore", "--enable", "--quit", "--preview-startup" })
                Assert(HostCommands.TryParseCli(cli, out var ipc) && HostCommands.IsIpc(ipc), "every-forwarded-cli-command-passes-server-validation:" + cli);
            Assert(HostCommands.TryParseCli("--preview-startup", out var preview) && preview == "preview-startup" && HostCommands.IsIpc(preview), "preview-command-roundtrip");
            Assert(HostCommands.TryParseCli("--startup", out var login) && login == "status", "existing-host-login-queries-without-relaunch");
            Assert(HostCommands.TryParseCli("--watch", out var watch) && watch == "status", "background-upgrade-only-starts-monitoring");
            Assert(HostCommands.TryParseCli("--self-test", out var offline) && offline == "" && !HostCommands.IsIpc("self-test"), "self-test-remains-local-only");
            Assert(!HostCommands.TryParseCli("preview-startup", out _) && !HostCommands.TryParseCli("--unknown", out _) && !HostCommands.IsIpc("preview-startup extra"), "reject-malformed-commands");
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
