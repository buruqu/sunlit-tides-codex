using SunlitTidesCodex;

var checks = 0;
void Equal<T>(T expected, T actual, string name) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception(name + ": " + actual + " != " + expected); checks++; }
var cases = new[] {
    new StartupPixelRect(100, 80, 1331, 917),
    new StartupPixelRect(0, 0, 1920, 1040),
    new StartupPixelRect(-2560, -180, -641, 1117),
    new StartupPixelRect(1920, 70, 3647, 1259),
    new StartupPixelRect(-200, 50, 1100, 850)
};
foreach (var visible in cases)
{
    var resizeBorder = new StartupPixelRect(visible.Left - 8, visible.Top, visible.Right + 8, visible.Bottom + 8);
    Equal<StartupPixelRect?>(visible, StartupWindowGeometry.SelectVisibleFrame(visible, resizeBorder), "DWM exact physical frame");
    Equal<StartupPixelRect?>(visible, StartupWindowGeometry.SelectVisibleFrame(null, visible), "native fallback preserves coordinates");
    // Monitor DPI must never rescale a desktop origin or physical target frame.
    foreach (var dpi in new[] { 96, 120, 144, 192 }) Equal<StartupPixelRect?>(visible, StartupWindowGeometry.SelectVisibleFrame(visible, null), "physical coordinates at DPI " + dpi);
}
Equal<StartupPixelRect?>(null, StartupWindowGeometry.SelectVisibleFrame(new(0, 0, 0, 900), new(20, 40, 10, 30)), "invalid frames fail closed");
Equal<StartupPixelRect?>(new StartupPixelRect(10, 20, 710, 620), StartupWindowGeometry.SelectVisibleFrame(new(0, 0, 0, 0), new(10, 20, 710, 620)), "invalid DWM uses native bounds");
Equal(false, new StartupPixelRect(int.MinValue, 0, int.MaxValue, 100).Usable, "overflow cannot become a placement");
foreach (var work in new[] { new StartupPixelRect(0,0,1920,1040), new StartupPixelRect(-2560,-200,-640,880), new StartupPixelRect(1920,0,3000,1920), new StartupPixelRect(0,0,640,360) })
{
    var preview = StartupWindowGeometry.PreviewFrame(work);
    Equal(true, preview.Left >= work.Left && preview.Top >= work.Top && preview.Right <= work.Right && preview.Bottom <= work.Bottom, "preview stays in selected monitor work area");
    Equal(true, Math.Abs(preview.Width / (double)preview.Height - 16d/9) < .01, "preview has no added controls row");
}
Equal(true, StartupWindowGeometry.PreviewFrame(new(1,1,0,0)).Usable, "preview fallback is usable");
Console.WriteLine($"startup-window-geometry: {checks} pure checks passed; no GUI or native window calls");
