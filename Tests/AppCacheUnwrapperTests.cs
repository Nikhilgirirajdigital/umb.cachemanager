using Microsoft.Extensions.Caching.Memory;
using Umbraco.Cms.Core.Cache;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

public class AppCacheUnwrapperTests
{
    [Fact]
    public void Unwraps_object_cache_app_cache()
    {
        var cache = new ObjectCacheAppCache();

        Assert.NotNull(AppCacheUnwrapper.Unwrap(cache));
    }

    [Fact]
    public void Unwraps_through_deep_clone_decorator()
    {
        var cache = new DeepCloneAppCache(new ObjectCacheAppCache());

        Assert.NotNull(AppCacheUnwrapper.Unwrap(cache));
    }

    [Fact]
    public void Unwrapped_cache_sees_inserted_entries()
    {
        var inner = new ObjectCacheAppCache();
        inner.Insert("MySite.Nav", () => "navdata");

        var unwrapped = AppCacheUnwrapper.Unwrap(new DeepCloneAppCache(inner));

        Assert.NotNull(unwrapped);
        Assert.True(unwrapped!.TryGetValue("MySite.Nav", out _));
    }

    [Fact]
    public void Returns_null_for_null_input() => Assert.Null(AppCacheUnwrapper.Unwrap(null));

    [Fact]
    public void Returns_null_for_cache_with_no_memory_cache()
        => Assert.Null(AppCacheUnwrapper.Unwrap(new DictionaryAppCache()));

    [Fact]
    public void Returns_null_when_property_getter_throws()
    {
        var cache = new ThrowingPropertyAppCache();

        Assert.Null(AppCacheUnwrapper.Unwrap(cache));
    }

    // --- DescribeChain: the same walk as Unwrap, reporting the path instead of the destination.
    // Assert only the ENDS of the chain. Whether DeepCloneAppCache exposes a MemoryCache property
    // directly (short-circuiting past ObjectCacheAppCache) is an Umbraco internal; pinning the
    // exact sequence would make this a liability rather than a guard. ---

    [Fact]
    public void DescribeChain_starts_at_the_outer_decorator_and_ends_at_the_memory_cache()
    {
        var chain = AppCacheUnwrapper.DescribeChain(new DeepCloneAppCache(new ObjectCacheAppCache()));

        Assert.Equal("DeepCloneAppCache", chain[0]);
        Assert.Equal("MemoryCache", chain[^1]);
    }

    [Fact]
    public void DescribeChain_returns_empty_for_null_input()
        => Assert.Empty(AppCacheUnwrapper.DescribeChain(null));

    [Fact]
    public void DescribeChain_does_not_throw_when_a_property_getter_throws()
    {
        // Reports what it managed to see rather than propagating — best-effort, like Unwrap.
        var chain = AppCacheUnwrapper.DescribeChain(new ThrowingPropertyAppCache());

        Assert.Equal("ThrowingPropertyAppCache", Assert.Single(chain));
    }

    [Fact]
    public void DescribeChain_reports_a_cache_it_cannot_walk_past()
    {
        var chain = AppCacheUnwrapper.DescribeChain(new DictionaryAppCache());

        Assert.Equal("DictionaryAppCache", Assert.Single(chain));
    }
}

/// <summary>
/// Custom IAppCache implementation whose MemoryCache property getter throws.
/// Used to verify that Unwrap handles reflection exceptions gracefully.
/// </summary>
internal class ThrowingPropertyAppCache : IAppCache
{
    public MemoryCache? MemoryCache
    {
        get => throw new InvalidOperationException("Simulated property getter failure");
    }

    public void Clear() { }
    public void Clear(string key) { }
    public void ClearOfType(Type type) { }
    public void ClearOfType<T>() { }
    public void ClearOfType<T>(Func<string, T, bool> predicate) { }
    public void ClearByKey(string keyStartsWith) { }
    public void ClearByRegex(string regex) { }
    public object? Get(string key) => null;
    public object? Get(string key, Func<object?> factory) => null;
    public IEnumerable<string> Keys => Enumerable.Empty<string>();
    public void Remove(string key) { }
    public void Insert(string key, Func<object?> factory) { }
    public void Insert(string key, Func<object?> factory, TimeSpan? expiration, bool isSliding = false) { }
    public IEnumerable<object?> SearchByKey(string key) => Enumerable.Empty<object?>();
    public IEnumerable<object?> SearchByRegex(string regex) => Enumerable.Empty<object?>();
}
