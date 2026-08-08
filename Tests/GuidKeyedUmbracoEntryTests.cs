using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Cache;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// Reproduces the live-site report: Umbraco's hybrid content cache fills the dashboard with rows
/// keyed by bare GUIDs and typed <c>ImmutableCacheItem&lt;ContentCacheNode&gt;</c>. Nothing about
/// those keys matches a prefix, so they landed in the user's "Your cache" section. They must be
/// classified as system entries on the strength of their value type instead.
/// </summary>
public class GuidKeyedUmbracoEntryTests
{
    /// <summary>A neutral container around an Umbraco payload — the shape Umbraco actually caches.</summary>
    private sealed record ImmutableCacheItemStandIn<T>(T Value);

    private static CacheInspector Build(IMemoryCache memory)
    {
        var appCaches = new AppCaches(
            new DeepCloneAppCache(new ObjectCacheAppCache()),
            NoAppCache.Instance,
            new IsolatedCaches(_ => new ObjectCacheAppCache()));

        return new CacheInspector(
            appCaches,
            memory,
            new UmbracoSystemKeyMatcher(new ConfigurationBuilder().Build()),
            new MemoryCacheReader(NullLogger<MemoryCacheReader>.Instance),
            NullLogger<CacheInspector>.Instance);
    }

    private static CacheEntryInfo SingleMemoryEntry(CacheInspector inspector)
        => Assert.Single(inspector.GetStores().Single(s => s.Store == CacheStores.Memory).Entries);

    /// <summary>
    /// Guards the premise of the tests below: the GUID key matches NO prefix, so key-based
    /// detection genuinely cannot classify these. If this ever starts returning true, the
    /// type-based tests would pass for the wrong reason.
    /// </summary>
    [Fact]
    public void Guid_key_alone_is_not_recognised_as_system()
    {
        var matcher = new UmbracoSystemKeyMatcher(new ConfigurationBuilder().Build());

        Assert.False(matcher.IsSystemKey("000bcf3c-ade2-436b-978d-2e6a475b222a"));
    }

    [Fact]
    public void Guid_keyed_umbraco_payload_is_classified_as_system()
    {
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        // A bare GUID, exactly as reported from the live site — no prefix to match on.
        memory.Set(
            "000bcf3c-ade2-436b-978d-2e6a475b222a",
            new ImmutableCacheItemStandIn<ObjectCacheAppCache>(new ObjectCacheAppCache()));

        Assert.True(SingleMemoryEntry(Build(memory)).IsSystem);
    }

    [Fact]
    public void Guid_keyed_user_payload_is_still_the_users_own()
    {
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        // Same opaque key shape, but the user's own data — must NOT be swept into the system bucket.
        memory.Set("000bcf3c-ade2-436b-978d-2e6a475b222a", new List<string> { "nav" });

        Assert.False(SingleMemoryEntry(Build(memory)).IsSystem);
    }

    [Fact]
    public void Umbraco_payload_behind_a_created_lazy_is_classified_as_system()
    {
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        var lazy = new Lazy<object>(() => new ObjectCacheAppCache());
        _ = lazy.Value; // force it HERE, so the inspector reads an already-created wrapper

        memory.Set("00000000-0000-0000-0000-000000000000", lazy);

        Assert.True(SingleMemoryEntry(Build(memory)).IsSystem);
    }

    [Fact]
    public void Uncreated_lazy_is_not_forced_by_classification()
    {
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        var ran = false;
        memory.Set("uncreated", new Lazy<object>(() =>
        {
            ran = true;
            return new ObjectCacheAppCache();
        }));

        _ = SingleMemoryEntry(Build(memory));

        Assert.False(ran);
    }

    [Fact]
    public void Ordinary_user_entry_remains_visible_as_theirs()
    {
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        memory.Set("MySite.Nav", new List<string> { "home", "about" });

        var entry = SingleMemoryEntry(Build(memory));

        Assert.False(entry.IsSystem);
        Assert.Equal("List<String>", entry.ValueType);
    }
}
