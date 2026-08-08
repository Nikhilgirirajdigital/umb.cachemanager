using Microsoft.Extensions.Configuration;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

public class UmbracoSystemKeyMatcherTests
{
    private static UmbracoSystemKeyMatcher Build(params string[] extraPrefixes)
    {
        var values = new Dictionary<string, string?>();
        for (var i = 0; i < extraPrefixes.Length; i++)
        {
            values[$"CacheManager:SystemKeyPrefixes:{i}"] = extraPrefixes[i];
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new UmbracoSystemKeyMatcher(configuration);
    }

    [Fact]
    public void Matches_default_prefix() => Assert.True(Build().IsSystemKey("umbraco-dynamic-dashboard"));

    [Fact]
    public void Matching_is_case_insensitive() => Assert.True(Build().IsSystemKey("UMBRACO.Cms.Thing"));

    [Fact]
    public void Custom_key_is_not_system() => Assert.False(Build().IsSystemKey("MySite.Nav"));

    [Fact]
    public void Empty_key_is_not_system() => Assert.False(Build().IsSystemKey(string.Empty));

    [Fact]
    public void Configured_prefixes_are_matched() => Assert.True(Build("MySite.").IsSystemKey("MySite.Nav"));

    [Fact]
    public void Configured_prefixes_do_not_replace_defaults()
        => Assert.True(Build("MySite.").IsSystemKey("NuCache.Something"));
}
