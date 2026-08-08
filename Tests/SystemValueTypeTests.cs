using System.Collections.Immutable;
using Microsoft.Extensions.Configuration;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// Some platform entries can only be recognised by their exact value type. OpenIddict caches
/// <c>ImmutableArray&lt;String&gt;</c>, and the site owner asked for that type to count as system.
///
/// Matching is on the EXACT formatted type name, not the namespace: <c>ImmutableArray&lt;String&gt;</c>
/// is platform noise, but <c>ImmutableArray&lt;Product&gt;</c> is the host's own data and must stay
/// visible. A namespace rule could not tell those apart.
/// </summary>
public class SystemValueTypeTests
{
    private sealed record Product(string Name);

    private static UmbracoSystemKeyMatcher Build(params string[] systemValueTypes)
    {
        var values = new Dictionary<string, string?>();
        for (var i = 0; i < systemValueTypes.Length; i++)
        {
            values[$"CacheManager:SystemValueTypes:{i}"] = systemValueTypes[i];
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new UmbracoSystemKeyMatcher(configuration);
    }

    [Fact]
    public void ImmutableArray_of_string_is_system_by_default()
        => Assert.True(Build().IsSystemEntry("anything", typeof(ImmutableArray<string>)));

    [Fact]
    public void ImmutableArray_of_a_host_type_is_NOT_system()
        => Assert.False(Build().IsSystemEntry("MySite.Products", typeof(ImmutableArray<Product>)));

    [Fact]
    public void List_of_string_is_untouched()
        => Assert.False(Build().IsSystemEntry("MySite.Tags", typeof(List<string>)));

    [Fact]
    public void Plain_string_is_untouched()
        => Assert.False(Build().IsSystemEntry("MySite.Title", typeof(string)));

    [Fact]
    public void Null_value_type_does_not_match()
        => Assert.False(Build().IsSystemEntry("MySite.Thing", null));

    [Fact]
    public void Matching_is_case_insensitive()
        => Assert.True(Build("immutablearray<string>").IsSystemEntry("x", typeof(ImmutableArray<string>)));

    [Fact]
    public void Configured_type_is_matched()
        => Assert.True(Build("List<String>").IsSystemEntry("x", typeof(List<string>)));

    [Fact]
    public void Configured_types_do_not_replace_the_default()
        => Assert.True(Build("List<String>").IsSystemEntry("x", typeof(ImmutableArray<string>)));

    /// <summary>
    /// The escape hatch: an explicit host declaration still wins, so a site that genuinely caches
    /// ImmutableArray&lt;String&gt; under its own prefix can get it back.
    /// </summary>
    [Fact]
    public void Allowlist_overrides_the_value_type_rule()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["CacheManager:MyKeyPrefixes:0"] = "MySite."
            })
            .Build();

        Assert.False(new UmbracoSystemKeyMatcher(configuration)
            .IsSystemEntry("MySite.Scopes", typeof(ImmutableArray<string>)));
    }

    /// <summary>The live OpenIddict rows: right key shape AND right value type — caught either way.</summary>
    [Fact]
    public void Live_openiddict_row_is_system()
        => Assert.True(Build().IsSystemEntry(
            "851d6f08-2ee0-4452-bbe5-ab864611ecaa[\"https://gymnation.com/umbraco/oauth_complete\"]",
            typeof(ImmutableArray<string>)));
}
