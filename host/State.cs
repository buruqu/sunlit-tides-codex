using System.Text.Json;

namespace SunlitTidesCodex;

internal sealed record Settings(bool Enabled = true, int? LastPort = null, bool StartupEnabled = true);
internal sealed record Health(bool Running, bool Enabled, string State, int AttachedPages, int? Port, DateTimeOffset UpdatedAt, string Version = "1.2.10", bool StartupEnabled = true);

internal sealed class StateStore
{
    internal static string DataDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SunlitTidesCodex", "data");
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly object _gate = new();
    internal Settings Read()
    {
        lock (_gate)
        {
            try { return JsonSerializer.Deserialize<Settings>(File.ReadAllText(Path.Combine(DataDirectory, "settings.json")), Json) ?? new(); }
            catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException) { return new(); }
        }
    }
    internal void Save(Settings settings) => Write("settings.json", settings);
    internal void SaveHealth(Health health) => Write("status.json", health);
    private void Write<T>(string name, T value)
    {
        lock (_gate)
        {
            Directory.CreateDirectory(DataDirectory);
            var target = Path.Combine(DataDirectory, name);
            var temp = target + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(value, Json));
            File.Move(temp, target, overwrite: true);
        }
    }
    internal void Log(string category)
    {
        // Only fixed diagnostic categories, never exception messages, URLs, CDP bodies or conversations.
        lock (_gate)
        {
            try
            {
                Directory.CreateDirectory(DataDirectory);
                var path = Path.Combine(DataDirectory, "host.log");
                if (File.Exists(path) && new FileInfo(path).Length > 128 * 1024)
                    File.Move(path, path + ".1", overwrite: true);
                File.AppendAllText(path, $"{DateTimeOffset.Now:O} {category}\n");
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        }
    }
}
