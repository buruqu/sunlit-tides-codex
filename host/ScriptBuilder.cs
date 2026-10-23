using System.Reflection;
using System.Text.Json;

namespace SunlitTidesCodex;

internal sealed record ThemeScripts(string Apply, string Bootstrap, string Remove, string Probe);
internal static class ScriptBuilder
{
    private static string Read(string file)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("SunlitTidesCodex.Scripts." + file) ?? throw new InvalidDataException("bootstrap-resource-missing");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().Trim();
    }
    internal static ThemeScripts Build(string payload, string removal, string fingerprint)
    {
        if (fingerprint.Length != 64 || fingerprint.Any(c => !Uri.IsHexDigit(c))) throw new InvalidDataException("fingerprint-invalid");
        string Expand(string text) => text.Replace("%%FINGERPRINT%%", JsonSerializer.Serialize(fingerprint)).Replace("%%ALLOWED%%", Read("allowed.js"));
        var install = Expand(Read("install.js")).Replace("%%PAYLOAD%%", payload).Replace("%%REMOVAL%%", removal);
        return new(Expand(Read("apply.js")).Replace("%%INSTALL%%", install),
            Expand(Read("bootstrap.js")).Replace("%%INSTALL%%", install),
            Expand(Read("remove.js")).Replace("%%REMOVAL%%", removal), Expand(Read("probe.js")));
    }
}
