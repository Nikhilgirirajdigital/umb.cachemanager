using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Cache;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// The dashboard renders stores in the order the API returns them, so that order is a real part of
/// the contract rather than an accident. Pinned here because it is otherwise invisible to review.
/// </summary>
public class StoreDisplayOrderTests
{
    private static CacheInspector Build()
    {
        var appCaches = new AppCaches(
            new DeepCloneAppCache(new ObjectCacheAppCache()),
            NoAppCache.Instance,
            new IsolatedCaches(_ => new ObjectCacheAppCache()));

        return new CacheInspector(
            appCaches,
            new MemoryCache(Options.Create(new MemoryCacheOptions())),
            new UmbracoSystemKeyMatcher(new ConfigurationBuilder().Build()),
            new MemoryCacheReader(NullLogger<MemoryCacheReader>.Instance),
            NullLogger<CacheInspector>.Instance);
    }

    [Fact]
    public void Memory_store_is_listed_before_the_runtime_store()
    {
        var stores = Build().GetStores();

        Assert.Equal(
            new[] { CacheStores.Memory, CacheStores.Runtime },
            stores.Select(s => s.Store).ToArray());
    }

    [Fact]
    public void Display_names_follow_the_same_order()
    {
        var stores = Build().GetStores();

        Assert.Equal("ASP.NET Core Memory Cache", stores[0].DisplayName);
        Assert.Equal("Umbraco Runtime Cache", stores[1].DisplayName);
    }
}
