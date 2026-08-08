using Microsoft.Extensions.Configuration;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// Real entries reported from a live Umbraco 17 site that the heuristic missed. These must be
/// classified with NO configuration, because OpenIddict ships with every Umbraco 17 install — it is
/// the backoffice's own auth server — so every user of this package sees those rows.
/// </summary>
public class PlatformDefaultsTests
{
    private static UmbracoSystemKeyMatcher Build()
        => new(new ConfigurationBuilder().Build());

    // ---- OpenIddict: GUID + JSON array key, value is a plain ImmutableArray<String> ----------
    // The value type is a BCL type, so type matching cannot help. The KEY SHAPE is the tell.

    [Theory]
    [InlineData("0347e0aa-3a26-410a-97e8-a83bdeb21a1f[\"ept:authorization\",\"ept:token\"]")]
    [InlineData("2ba4ab0f-e2ec-4d48-b3bd-28e2bb660c75[\"offline_access\"]")]
    [InlineData("851d6f08-2ee0-4452-bbe5-ab864611ecaa[\"https://gymnation.com/umbraco/oauth_complete\"]")]
    [InlineData("fb14dfb9-9216-4b77-bfa9-7e85f8201ff4[\"https://localhost:44347/umbraco/logout\"]")]
    public void Openiddict_composite_key_is_system(string key)
        => Assert.True(Build().IsSystemEntry(key, typeof(string[])));

    [Fact]
    public void Bare_guid_key_alone_is_NOT_swept_up_by_the_shape_rule()
    {
        // Deliberately narrow: a bare GUID is a plausible user key (cache-by-node-id), so only the
        // GUID-followed-by-bracket composite form is treated as platform.
        Assert.False(Build().IsSystemEntry("000bcf3c-ade2-436b-978d-2e6a475b222a", typeof(string)));
    }

    [Fact]
    public void Guid_like_but_malformed_key_is_not_matched()
        => Assert.False(Build().IsSystemEntry("not-a-guid-at-all-really-no[\"x\"]", typeof(string)));

    [Fact]
    public void User_key_containing_a_bracket_is_not_matched()
        => Assert.False(Build().IsSystemEntry("MySite.Products[\"featured\"]", typeof(string)));

    // ---- Third-party packages: caught by their own root namespace on the value type ----------

    [Fact]
    public void Urltracker_payload_is_system_via_generic_argument()
    {
        // The live row was `ic:UrlTrackerGetShallowWithRegexAsync` typed List<IRedirect>, where
        // IRedirect is UrlTracker.Core.Models.IRedirect — not an Umbraco type. The generic argument
        // is what identifies it, exactly as with ImmutableCacheItem<ContentCacheNode>.
        Assert.True(Build().IsSystemType(typeof(List<UrlTracker.Core.Models.FakeRedirect>)));
    }

    [Fact]
    public void Ordinary_user_entry_is_untouched_by_all_of_this()
        => Assert.False(Build().IsSystemEntry("MySite.Nav", typeof(List<string>)));

    [Fact]
    public void Allowlist_still_overrides_every_default_rule()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["CacheManager:MyKeyPrefixes:0"] = "0347e0aa"
            })
            .Build();

        // Contrived, but it pins the precedence: an explicit host declaration wins outright.
        Assert.False(new UmbracoSystemKeyMatcher(configuration)
            .IsSystemEntry("0347e0aa-3a26-410a-97e8-a83bdeb21a1f[\"ept:token\"]", typeof(string[])));
    }
}
