using System.Collections;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

public class MemoryCacheReaderTests
{
    private static MemoryCacheReader Reader() => new(NullLogger<MemoryCacheReader>.Instance);

    private static MemoryCache Cache() => new(Options.Create(new MemoryCacheOptions()));

    [Fact]
    public void Null_cache_returns_null() => Assert.Null(Reader().Read(null));

    [Fact]
    public void Non_cache_object_returns_null() => Assert.Null(Reader().Read("not a cache"));

    [Fact]
    public void Empty_cache_returns_empty_list_not_null()
    {
        var entries = Reader().Read(Cache());

        Assert.NotNull(entries);
        Assert.Empty(entries!);
    }

    [Fact]
    public void Reads_key_and_value()
    {
        var cache = Cache();
        cache.Set("MySite.Nav", "navdata");

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.Equal("MySite.Nav", entry.Key);
        Assert.Equal("navdata", entry.Value);
        Assert.True(entry.MetadataAvailable);
    }

    [Fact]
    public void Reads_absolute_expiration()
    {
        var cache = Cache();
        cache.Set("abs", "v", new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
        });

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.NotNull(entry.AbsoluteExpiration);
        Assert.Null(entry.SlidingExpiration);
    }

    [Fact]
    public void Reads_sliding_expiration_and_last_accessed()
    {
        var cache = Cache();
        cache.Set("slide", "v", new MemoryCacheEntryOptions
        {
            SlidingExpiration = TimeSpan.FromMinutes(10)
        });

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.Equal(TimeSpan.FromMinutes(10), entry.SlidingExpiration);
        Assert.NotNull(entry.LastAccessedUtc);
    }

    [Fact]
    public void Entry_without_expiration_has_neither()
    {
        var cache = Cache();
        cache.Set("forever", "v");

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.Null(entry.AbsoluteExpiration);
        Assert.Null(entry.SlidingExpiration);
    }

    [Fact]
    public void Reads_non_string_keys()
    {
        var cache = Cache();
        cache.Set(42, "answer");

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.Equal("42", entry.Key);
    }

    // The displayed key is a rendering; only the ORIGINAL key object can remove the entry again,
    // so the reader must carry it out. Without this, clearing an object-keyed entry no-ops.
    [Fact]
    public void Carries_the_original_object_key()
    {
        var cache = Cache();
        var key = new object();
        cache.Set(key, "v");

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.Same(key, entry.ObjectKey);
        cache.Remove(entry.ObjectKey!);
        Assert.False(cache.TryGetValue(key, out _));
    }

    [Fact]
    public void Carries_the_original_key_for_string_keys_too()
    {
        var cache = Cache();
        cache.Set("MySite.Nav", "v");

        var entry = Assert.Single(Reader().Read(cache)!);

        Assert.Equal("MySite.Nav", entry.ObjectKey);
    }

    [Fact]
    public void Keys_only_fallback_carries_the_original_object_key()
    {
        var key = new object();
        var entry = Assert.Single(Reader().Read(new KeysOnlyCache(new[] { key }))!);

        Assert.Same(key, entry.ObjectKey);
    }

    [Fact]
    public void Reads_all_entries()
    {
        var cache = Cache();
        cache.Set("a", 1);
        cache.Set("b", 2);
        cache.Set("c", 3);

        Assert.Equal(3, Reader().Read(cache)!.Count);
    }

    // --- Fallback rung 2: a single "_entries" dictionary, no "_coherentState" at all. ---
    // This is the shape MemoryCache used on older runtimes. ReadFromCoherentState must return
    // null (no such field) before ReadFromEntriesField gets a chance to run, so this test only
    // passes if rung 2 genuinely works.
    [Fact]
    public void Reads_from_legacy_single_entries_field()
    {
        var dictionary = new Dictionary<object, object>
        {
            ["a"] = new FakeCacheEntry("a", "value-a"),
            ["b"] = new FakeCacheEntry("b", "value-b"),
        };
        var cache = new LegacyEntriesFieldCache(dictionary);

        var entries = Reader().Read(cache);

        Assert.NotNull(entries);
        Assert.Equal(2, entries!.Count);
        Assert.Contains(entries, e => e.Key == "a" && Equals(e.Value, "value-a") && e.MetadataAvailable);
        Assert.Contains(entries, e => e.Key == "b" && Equals(e.Value, "value-b") && e.MetadataAvailable);
    }

    // --- Fallback rung 3: only a public "Keys" property, no "_coherentState" and no "_entries". ---
    // Both earlier rungs must fail to find their fields before this one is exercised, so this
    // test only passes if rung 3 genuinely works.
    [Fact]
    public void Falls_back_to_keys_only_when_neither_dictionary_shape_is_present()
    {
        var cache = new KeysOnlyCache(new object[] { "x", "y" });

        var entries = Reader().Read(cache);

        Assert.NotNull(entries);
        Assert.Equal(2, entries!.Count);
        Assert.Contains(entries, e => e.Key == "x");
        Assert.Contains(entries, e => e.Key == "y");
        Assert.All(entries!, e => Assert.False(e.MetadataAvailable));
        Assert.All(entries!, e => Assert.Null(e.Value));
        Assert.All(entries!, e => Assert.Null(e.AbsoluteExpiration));
        Assert.All(entries!, e => Assert.Null(e.SlidingExpiration));
    }

    // Guards finding 1: a single entry whose metadata throws must degrade to
    // MetadataAvailable = false without losing its key, and must not take its siblings down
    // with it. Before the per-entry try/catch, the exception from ThrowingCacheEntry escaped
    // AddEntries, was caught by Read's outer try/catch, and the WHOLE list — including the
    // healthy sibling entry — came back null.
    [Fact]
    public void Entry_whose_metadata_throws_is_degraded_not_dropped_and_siblings_survive()
    {
        var dictionary = new Dictionary<object, object>
        {
            ["poison"] = new ThrowingCacheEntry("poison"),
            ["ok"] = new FakeCacheEntry("ok", "fine"),
        };
        var cache = new LegacyEntriesFieldCache(dictionary);

        var entries = Reader().Read(cache);

        Assert.NotNull(entries);
        Assert.Equal(2, entries!.Count);

        var poison = entries!.Single(e => e.Key == "poison");
        Assert.False(poison.MetadataAvailable);
        Assert.Null(poison.Value);
        Assert.Null(poison.AbsoluteExpiration);
        Assert.Null(poison.SlidingExpiration);

        var ok = entries!.Single(e => e.Key == "ok");
        Assert.True(ok.MetadataAvailable);
        Assert.Equal("fine", ok.Value);
    }

    /// <summary>A minimal <see cref="ICacheEntry"/> double for tests that don't need a real MemoryCache.</summary>
    private sealed class FakeCacheEntry : ICacheEntry
    {
        public FakeCacheEntry(object key, object? value)
        {
            Key = key;
            Value = value;
        }

        public object Key { get; }
        public object? Value { get; set; }
        public DateTimeOffset? AbsoluteExpiration { get; set; }
        public TimeSpan? AbsoluteExpirationRelativeToNow { get; set; }
        public TimeSpan? SlidingExpiration { get; set; }
        public IList<IChangeToken> ExpirationTokens { get; } = new List<IChangeToken>();
        public IList<PostEvictionCallbackRegistration> PostEvictionCallbacks { get; } = new List<PostEvictionCallbackRegistration>();
        public CacheItemPriority Priority { get; set; }
        public long? Size { get; set; }

        public void Dispose()
        {
        }
    }

    /// <summary>An <see cref="ICacheEntry"/> whose expiry metadata throws, to exercise per-entry degradation.</summary>
    private sealed class ThrowingCacheEntry : ICacheEntry
    {
        public ThrowingCacheEntry(object key) => Key = key;

        public object Key { get; }
        public object? Value { get => "poison-value"; set { } }
        public DateTimeOffset? AbsoluteExpiration
        {
            get => throw new InvalidOperationException("Simulated exotic entry failure.");
            set { }
        }
        public TimeSpan? AbsoluteExpirationRelativeToNow { get; set; }
        public TimeSpan? SlidingExpiration { get; set; }
        public IList<IChangeToken> ExpirationTokens { get; } = new List<IChangeToken>();
        public IList<PostEvictionCallbackRegistration> PostEvictionCallbacks { get; } = new List<PostEvictionCallbackRegistration>();
        public CacheItemPriority Priority { get; set; }
        public long? Size { get; set; }

        public void Dispose()
        {
        }
    }

    /// <summary>Mimics the older MemoryCache shape: a single "_entries" dictionary, no "_coherentState".</summary>
    private sealed class LegacyEntriesFieldCache
    {
        private readonly IDictionary _entries;

        public LegacyEntriesFieldCache(IDictionary entries) => _entries = entries;
    }

    /// <summary>Mimics a cache with neither dictionary shape, only a public "Keys" enumerable.</summary>
    private sealed class KeysOnlyCache
    {
        public IEnumerable<object> Keys { get; }

        public KeysOnlyCache(IEnumerable<object> keys) => Keys = keys;
    }
}
