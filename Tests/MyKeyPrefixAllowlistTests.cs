using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Cache;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// Blocklist detection cannot converge: OpenIddict caches under a GUID + JSON-array key holding an
/// <c>ImmutableArray&lt;String&gt;</c>, UrlTracker uses an <c>ic:</c> prefix, and the next package
/// installed will invent its own convention. The allowlist inverts the question — the host declares
/// which prefixes are ITS OWN, and everything else is inbuilt by definition.
/// </summary>
public class MyKeyPrefixAllowlistTests
{
    private static UmbracoSystemKeyMatcher Build(params string[] myPrefixes)
    {
        var values = new Dictionary<string, string?>();
        for (var i = 0; i < myPrefixes.Length; i++)
        {
            values[$"CacheManager:MyKeyPrefixes:{i}"] = myPrefixes[i];
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new UmbracoSystemKeyMatcher(configuration);
    }

    // ---- Allowlist mode: MyKeyPrefixes configured ------------------------------------------

    [Fact]
    public void Declared_prefix_is_the_hosts_own()
        => Assert.False(Build("MySite.").IsSystemEntry("MySite.Nav", typeof(string)));

    [Fact]
    public void Undeclared_key_is_system_even_with_a_harmless_value_type()
        => Assert.True(Build("MySite.").IsSystemEntry("SomethingElse", typeof(string)));

    /// <summary>The OpenIddict shape reported from the live site.</summary>
    [Fact]
    public void Openiddict_entry_is_system_in_allowlist_mode()
        => Assert.True(Build("MySite.").IsSystemEntry(
            "0347e0aa-3a26-410a-97e8-a83bdeb21a1f[\"ept:authorization\",\"ept:token\"]",
            typeof(string[])));

    /// <summary>The UrlTracker shape reported from the live site.</summary>
    [Fact]
    public void Third_party_package_entry_is_system_in_allowlist_mode()
        => Assert.True(Build("MySite.").IsSystemEntry("ic:UrlTrackerGetShallowWithRegexAsync", null));

    [Fact]
    public void Matching_is_case_insensitive()
        => Assert.False(Build("MySite.").IsSystemEntry("mysite.nav", typeof(string)));

    [Fact]
    public void Several_declared_prefixes_are_all_honoured()
    {
        var matcher = Build("MySite.", "GymNation.");

        Assert.False(matcher.IsSystemEntry("GymNation.Feed", typeof(string)));
        Assert.False(matcher.IsSystemEntry("MySite.Nav", typeof(string)));
        Assert.True(matcher.IsSystemEntry("umbraco-thing", typeof(string)));
    }

    /// <summary>
    /// The host's own declaration WINS over the type test. Caching Umbraco entities under your own
    /// prefix is legitimate and must not be swept into the inbuilt section.
    /// </summary>
    [Fact]
    public void Declared_prefix_beats_an_umbraco_value_type()
        => Assert.False(Build("MySite.").IsSystemEntry("MySite.Products", typeof(ObjectCacheAppCache)));

    // ---- Fallback mode: MyKeyPrefixes NOT configured ----------------------------------------

    [Fact]
    public void Without_allowlist_known_umbraco_prefix_is_still_system()
        => Assert.True(Build().IsSystemEntry("umbraco-dynamic-dashboard", typeof(string)));

    [Fact]
    public void Without_allowlist_umbraco_value_type_is_still_system()
        => Assert.True(Build().IsSystemEntry(
            "000bcf3c-ade2-436b-978d-2e6a475b222a", typeof(ObjectCacheAppCache)));

    [Fact]
    public void Without_allowlist_an_ordinary_entry_is_still_the_hosts_own()
        => Assert.False(Build().IsSystemEntry("MySite.Nav", typeof(string)));

    /// <summary>
    /// OpenIddict IS caught without configuration, via its composite key shape — it ships with every
    /// Umbraco 17 site, so leaving it to configuration was not good enough.
    /// </summary>
    [Fact]
    public void Without_allowlist_openiddict_entry_is_still_detected()
        => Assert.True(Build().IsSystemEntry(
            "0347e0aa-3a26-410a-97e8-a83bdeb21a1f[\"ept:token\"]", typeof(string[])));

    /// <summary>
    /// The residual cost of NOT declaring an allowlist: a package inventing its own key convention,
    /// with a BCL value type, is invisible to every heuristic. This is why the allowlist exists.
    /// </summary>
    [Fact]
    public void Without_allowlist_an_unknown_packages_entry_is_not_detected()
        => Assert.False(Build().IsSystemEntry("acme:widget-cache", typeof(List<string>)));

    [Fact]
    public void Blank_configured_prefixes_do_not_enable_allowlist_mode()
        => Assert.True(Build("   ").IsSystemEntry("umbraco-dynamic-dashboard", typeof(string)));
}
