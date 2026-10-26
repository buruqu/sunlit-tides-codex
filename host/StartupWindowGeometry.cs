namespace SunlitTidesCodex;

// Desktop coordinates stay in physical pixels, including negative monitor
// origins. Only WPF lays out the video/controls in the player's current DPI.
internal readonly record struct StartupPixelRect(int Left, int Top, int Right, int Bottom)
{
    internal int Width => (int)Math.Clamp((long)Right - Left, 0, int.MaxValue);
    internal int Height => (int)Math.Clamp((long)Bottom - Top, 0, int.MaxValue);
    internal bool Usable => (long)Right - Left is > 0 and <= int.MaxValue && (long)Bottom - Top is > 0 and <= int.MaxValue;
}

internal static class StartupWindowGeometry
{
    internal static StartupPixelRect? SelectVisibleFrame(StartupPixelRect? extendedFrame, StartupPixelRect? windowFrame) =>
        extendedFrame is { Usable: true } visible ? visible : windowFrame is { Usable: true } fallback ? fallback : null;

    // Explicit preview without a target is screen-local, unlike automatic playback.
    internal static StartupPixelRect PreviewFrame(StartupPixelRect work)
    {
        if (!work.Usable) work = new StartupPixelRect(0, 0, 960, 540);
        var width = Math.Max(1, Math.Min(1100, (int)Math.Floor(work.Width * .9)));
        var height = Math.Max(1, (int)Math.Round(width * 9d / 16));
        var maximumHeight = Math.Max(1, (int)Math.Floor(work.Height * .9));
        if (height > maximumHeight) { height = maximumHeight; width = Math.Max(1, (int)Math.Round(height * 16d / 9)); }
        var left = work.Left + (work.Width - width) / 2;
        var top = work.Top + (work.Height - height) / 2;
        return new StartupPixelRect(left, top, left + width, top + height);
    }
}
