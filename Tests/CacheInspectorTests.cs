using System.Collections;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using Umbraco.Cms.Core.Cache;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

public class CacheInspectorTests
{
    private static (CacheInspector Inspector, IMemoryCache Memory, IAppCache Runtime) Build()
    {
        var runtime = new DeepCloneAppCache(new ObjectCacheAppCache());
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));

        return (BuildWith(memory, runtime), memory, runtime);
    }

    private static CacheInspector BuildWith(IMemoryCache memory, IAppPolicyCache? runtime = null)
    {
        var appCaches = new AppCaches(
            runtime ?? new DeepCloneAppCache(new ObjectCacheAppCache()),
            NoAppCache.Instance,
            new IsolatedCaches(_ => new ObjectCacheAppCache()));
        var configuration = new ConfigurationBuilder().Build();

        return new CacheInspector(
            appCaches,
            memory,
            new UmbracoSystemKeyMatcher(configuration),
            new MemoryCacheReader(NullLogger<MemoryCacheReader>.Instance),
            NullLogger<CacheInspector>.Instance);
    }

    [Fact]
    public void Runtime_store_keys_are_now_available()
    {
        var (inspector, _, runtime) = Build();
        runtime.Get("MySite.Nav", () => "navdata");

        var store = inspector.GetStores().Single(s => s.Store == CacheStores.Runtime);

        Assert.True(store.KeysAvailable);
        Assert.Contains(store.Entries, e => e.Key == "MySite.Nav");
    }

    [Fact]
    public void Entry_without_expiry_reports_none()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.Config", "v");

        var entry = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries.Single();

        Assert.Equal("none", entry.ExpiryKind);
        Assert.Null(entry.ExpiresAt);
    }

    [Fact]
    public void Entry_with_absolute_expiry_reports_instant()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.Feed", "v", new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
        });

        var entry = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries.Single();

        Assert.Equal("absolute", entry.ExpiryKind);
        Assert.NotNull(entry.ExpiresAt);
        Assert.EndsWith("Z", entry.ExpiresAt);
    }

    [Fact]
    public void Entry_with_sliding_expiry_reports_sliding()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.Cart", "v", new MemoryCacheEntryOptions
        {
            SlidingExpiration = TimeSpan.FromMinutes(10)
        });

        var entry = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries.Single();

        Assert.Equal("sliding", entry.ExpiryKind);
        Assert.NotNull(entry.ExpiresAt);
    }

    [Fact]
    public void System_keys_are_flagged()
    {
        var (inspector, memory, _) = Build();
        memory.Set("umbraco-thing", "v");
        memory.Set("MySite.Nav", "v");

        var entries = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries;

        Assert.True(entries.Single(e => e.Key == "umbraco-thing").IsSystem);
        Assert.False(entries.Single(e => e.Key == "MySite.Nav").IsSystem);
    }

    [Fact]
    public void Value_type_is_friendly()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.List", new List<string> { "a" });

        var entry = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries.Single();

        Assert.Equal("List<String>", entry.ValueType);
    }

    [Fact]
    public void ClearCustom_removes_only_non_system_keys()
    {
        var (inspector, memory, _) = Build();
        memory.Set("umbraco-thing", "v");
        memory.Set("MySite.Nav", "v");

        var cleared = inspector.ClearCustom(CacheStores.Memory);

        Assert.Equal(1, cleared);
        Assert.True(memory.TryGetValue("umbraco-thing", out _));
        Assert.False(memory.TryGetValue("MySite.Nav", out _));
    }

    [Fact]
    public void ClearCustom_with_null_store_clears_both()
    {
        var (inspector, memory, runtime) = Build();
        memory.Set("MySite.A", "v");
        runtime.Get("MySite.B", () => "v");

        var cleared = inspector.ClearCustom(null);

        Assert.Equal(2, cleared);
        Assert.False(memory.TryGetValue("MySite.A", out _));
        Assert.Null(runtime.Get("MySite.B"));
    }

    // ClearSystem is ClearCustom's exact complement — the pair above and the pair below share one
    // implementation, so each also guards the other against a flipped predicate.
    [Fact]
    public void ClearSystem_removes_only_system_keys()
    {
        var (inspector, memory, _) = Build();
        memory.Set("umbraco-thing", "v");
        memory.Set("MySite.Nav", "v");

        var cleared = inspector.ClearSystem(CacheStores.Memory);

        Assert.Equal(1, cleared);
        Assert.False(memory.TryGetValue("umbraco-thing", out _));
        Assert.True(memory.TryGetValue("MySite.Nav", out _));
    }

    [Fact]
    public void ClearSystem_with_null_store_clears_both()
    {
        var (inspector, memory, runtime) = Build();
        memory.Set("umbraco-a", "v");
        runtime.Get("umbraco-b", () => "v");
        memory.Set("MySite.Keep", "v");

        var cleared = inspector.ClearSystem(null);

        Assert.Equal(2, cleared);
        Assert.False(memory.TryGetValue("umbraco-a", out _));
        Assert.Null(runtime.Get("umbraco-b"));
        Assert.True(memory.TryGetValue("MySite.Keep", out _));
    }

    [Fact]
    public void ClearKey_rejects_unknown_store()
    {
        var (inspector, _, _) = Build();

        Assert.Throws<ArgumentOutOfRangeException>(() => { inspector.ClearKey("nope", "k"); });
    }

    // --- Finding 1: Umbraco wraps runtime-cache values in Lazy<object>, so the Type column used
    // to read "Lazy<Object>" for every entry in the store the user's own caches live in. ---

    [Fact]
    public void Runtime_entry_reports_the_type_inside_umbracos_lazy_wrapper()
    {
        var (inspector, _, runtime) = Build();
        runtime.Get("MySite.Nav", () => new List<string> { "a" });

        // Guard the premise: what Umbraco actually stores IS a Lazy wrapper, so a naive
        // value.GetType() would report "Lazy<Object>" here.
        var raw = new MemoryCacheReader(NullLogger<MemoryCacheReader>.Instance)
            .Read(AppCacheUnwrapper.Unwrap(runtime))!
            .Single(e => e.Key == "MySite.Nav");
        Assert.StartsWith("Lazy<", TypeNameFormatter.Format(raw.Value?.GetType()));

        var entry = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Runtime).Entries
            .Single(e => e.Key == "MySite.Nav");

        Assert.Equal("List<String>", entry.ValueType);
    }

    [Fact]
    public void Uncreated_lazy_value_is_not_forced_by_inspection()
    {
        var (inspector, memory, _) = Build();
        var ran = false;
        memory.Set("MySite.Lazy", new Lazy<object>(() =>
        {
            ran = true;
            return new List<string>();
        }));

        var entry = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries.Single();

        Assert.False(ran);
        Assert.Equal("Lazy<Object>", entry.ValueType);
    }

    // --- Finding 2: IMemoryCache is keyed by object. Listing stringifies the key, so clearing by
    // that string used to match nothing while the API still answered 200 "Cleared". ---

    [Fact]
    public void ClearKey_removes_a_string_keyed_entry_and_reports_success()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.Nav", "v");

        Assert.True(inspector.ClearKey(CacheStores.Memory, "MySite.Nav"));
        Assert.False(memory.TryGetValue("MySite.Nav", out _));
    }

    [Fact]
    public void ClearKey_removes_a_runtime_entry_and_reports_success()
    {
        var (inspector, _, runtime) = Build();
        runtime.Get("MySite.Nav", () => "v");

        Assert.True(inspector.ClearKey(CacheStores.Runtime, "MySite.Nav"));
        Assert.Null(runtime.Get("MySite.Nav"));
    }

    [Fact]
    public void ClearKey_removes_an_object_keyed_entry_by_its_original_key()
    {
        var (inspector, memory, _) = Build();
        var key = new CompositeKey("nav", 7);
        memory.Set(key, "v");

        var listed = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries.Single();
        Assert.Equal(key.ToString(), listed.Key);
        Assert.False(listed.IsSystem); // it lands in the "Your cache" section, with a Clear button

        Assert.True(inspector.ClearKey(CacheStores.Memory, listed.Key));
        Assert.False(memory.TryGetValue(key, out _));
    }

    // Two distinct key objects can render to the same string, and the dashboard shows them as ONE
    // row with ONE Clear button. Documented behaviour: clear every match, so the row's Clear never
    // leaves something behind while claiming success.
    [Fact]
    public void ClearKey_removes_every_entry_sharing_a_stringified_key()
    {
        var (inspector, memory, _) = Build();
        var first = new CompositeKey("nav", 1);
        var second = new CollidingKey("nav", 1);
        memory.Set(first, "a");
        memory.Set(second, "b");

        Assert.Equal(first.ToString(), second.ToString());
        Assert.True(inspector.ClearKey(CacheStores.Memory, first.ToString()!));
        Assert.False(memory.TryGetValue(first, out _));
        Assert.False(memory.TryGetValue(second, out _));
    }

    [Fact]
    public void ClearCustom_removes_object_keyed_entries_and_counts_them()
    {
        var (inspector, memory, _) = Build();
        var key = new CompositeKey("nav", 7);
        memory.Set(key, "v");

        var cleared = inspector.ClearCustom(CacheStores.Memory);

        Assert.Equal(1, cleared);
        Assert.False(memory.TryGetValue(key, out _));
    }

    // The no-false-success guarantee: if the entry survives the clear, say so.
    [Fact]
    public void ClearKey_reports_failure_when_the_entry_survives()
    {
        var memory = new UnremovableMemoryCache("MySite.Nav", "v");
        var inspector = BuildWith(memory);

        Assert.False(inspector.ClearKey(CacheStores.Memory, "MySite.Nav"));
        Assert.True(memory.Contains("MySite.Nav"));
    }

    [Fact]
    public void ClearCustom_does_not_count_entries_that_survive()
    {
        var memory = new UnremovableMemoryCache("MySite.Nav", "v");
        var inspector = BuildWith(memory);

        Assert.Equal(0, inspector.ClearCustom(CacheStores.Memory));
    }

    private sealed record CompositeKey(string Name, int Id)
    {
        public override string ToString() => $"nav-key:{Name}:{Id}";
    }

    /// <summary>A different type that renders to the same string as <see cref="CompositeKey"/>.</summary>
    private sealed record CollidingKey(string Name, int Id)
    {
        public override string ToString() => $"nav-key:{Name}:{Id}";
    }

    /// <summary>
    /// An <see cref="IMemoryCache"/> whose entries the reader CAN enumerate (legacy "_entries"
    /// shape) but whose <see cref="IMemoryCache.Remove"/> does nothing — exactly the pre-fix
    /// failure mode, where the clear silently no-ops and the entry stays cached.
    /// </summary>
    private sealed class UnremovableMemoryCache : IMemoryCache
    {
        private readonly IDictionary _entries;

        public UnremovableMemoryCache(object key, object? value) =>
            _entries = new Dictionary<object, object> { [key] = new StubEntry(key, value) };

        public bool Contains(object key) => _entries.Contains(key);

        public bool TryGetValue(object key, out object? value)
        {
            value = (_entries[key] as ICacheEntry)?.Value;
            return value is not null;
        }

        public ICacheEntry CreateEntry(object key) => new StubEntry(key, null);

        public void Remove(object key)
        {
            // Deliberately does nothing.
        }

        public void Dispose()
        {
        }
    }

    private sealed class StubEntry : ICacheEntry
    {
        public StubEntry(object key, object? value)
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
        public IList<PostEvictionCallbackRegistration> PostEvictionCallbacks { get; } =
            new List<PostEvictionCallbackRegistration>();
        public CacheItemPriority Priority { get; set; }
        public long? Size { get; set; }

        public void Dispose()
        {
        }
    }

    /// <summary>An <see cref="IMemoryCache"/> the reader cannot enumerate at all.</summary>
    private sealed class UnreadableMemoryCache : IMemoryCache
    {
        public bool TryGetValue(object key, out object? value)
        {
            value = null;
            return false;
        }

        public ICacheEntry CreateEntry(object key) => new StubEntry(key, null);

        public void Remove(object key)
        {
        }

        public void Dispose()
        {
        }
    }

    // --- ClearKeys: an explicit batch, which may span both stores. ---

    [Fact]
    public void ClearKeys_removes_only_the_named_keys()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.A", "v");
        memory.Set("MySite.B", "v");
        memory.Set("MySite.C", "v");

        var result = inspector.ClearKeys(
        [
            new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.A" },
            new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.C" }
        ]);

        Assert.Equal(2, result.Cleared);
        Assert.Empty(result.Failed);
        Assert.False(memory.TryGetValue("MySite.A", out _));
        Assert.True(memory.TryGetValue("MySite.B", out _));
        Assert.False(memory.TryGetValue("MySite.C", out _));
    }

    [Fact]
    public void ClearKeys_spans_both_stores_in_one_call()
    {
        var (inspector, memory, runtime) = Build();
        memory.Set("MySite.A", "v");
        runtime.Get("MySite.B", () => "v");

        var result = inspector.ClearKeys(
        [
            new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.A" },
            new CacheKeyRef { Store = CacheStores.Runtime, Key = "MySite.B" }
        ]);

        Assert.Equal(2, result.Cleared);
        Assert.False(memory.TryGetValue("MySite.A", out _));
        Assert.Null(runtime.Get("MySite.B"));
    }

    [Fact]
    public void ClearKeys_clears_a_system_key_when_it_was_explicitly_selected()
    {
        // Marking is advisory. If the user ticked it, clear it.
        var (inspector, memory, _) = Build();
        memory.Set("umbraco-thing", "v");

        var result = inspector.ClearKeys(
            [new CacheKeyRef { Store = CacheStores.Memory, Key = "umbraco-thing" }]);

        Assert.Equal(1, result.Cleared);
        Assert.False(memory.TryGetValue("umbraco-thing", out _));
    }

    [Fact]
    public void ClearKeys_reports_a_surviving_key_as_failed()
    {
        var memory = new UnremovableMemoryCache("MySite.Nav", "v");
        var inspector = BuildWith(memory);

        var result = inspector.ClearKeys(
            [new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.Nav" }]);

        Assert.Equal(0, result.Cleared);
        var failed = Assert.Single(result.Failed);
        Assert.Equal("MySite.Nav", failed.Key);
        Assert.Equal(CacheStores.Memory, failed.Store);
    }

    [Fact]
    public void ClearKeys_rejects_an_unknown_store_before_removing_anything()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.A", "v");

        Assert.Throws<ArgumentOutOfRangeException>(() => inspector.ClearKeys(
        [
            new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.A" },
            new CacheKeyRef { Store = "nope", Key = "MySite.A" }
        ]));

        // The valid item in the same batch must NOT have been removed.
        Assert.True(memory.TryGetValue("MySite.A", out _));
    }

    [Fact]
    public void ClearKeys_deduplicates_repeated_keys()
    {
        var (inspector, memory, _) = Build();
        memory.Set("MySite.A", "v");

        var result = inspector.ClearKeys(
        [
            new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.A" },
            new CacheKeyRef { Store = CacheStores.Memory, Key = "MySite.A" }
        ]);

        Assert.Equal(1, result.Cleared);
    }

    [Fact]
    public void ClearKeys_reads_the_store_a_fixed_number_of_times_regardless_of_batch_size()
    {
        // The entire reason this endpoint exists: an N-key batch must not cost N enumerations.
        var memory = new MemoryCache(Options.Create(new MemoryCacheOptions()));
        for (var i = 0; i < 20; i++)
        {
            memory.Set($"MySite.{i}", "v");
        }

        var reader = new CountingMemoryCacheReader();
        var inspector = new CacheInspector(
            new AppCaches(
                new DeepCloneAppCache(new ObjectCacheAppCache()),
                NoAppCache.Instance,
                new IsolatedCaches(_ => new ObjectCacheAppCache())),
            memory,
            new UmbracoSystemKeyMatcher(new ConfigurationBuilder().Build()),
            reader,
            NullLogger<CacheInspector>.Instance);

        var items = Enumerable.Range(0, 20)
            .Select(i => new CacheKeyRef { Store = CacheStores.Memory, Key = $"MySite.{i}" })
            .ToList();

        var before = reader.Reads;
        var result = inspector.ClearKeys(items);

        Assert.Equal(20, result.Cleared);
        // One snapshot before the batch, one verification after. Not 40.
        Assert.Equal(2, reader.Reads - before);
    }

    /// <summary>Counts how many times a store gets enumerated.</summary>
    private sealed class CountingMemoryCacheReader : MemoryCacheReader
    {
        public CountingMemoryCacheReader() : base(NullLogger<MemoryCacheReader>.Instance)
        {
        }

        public int Reads { get; private set; }

        public override IReadOnlyList<RawCacheEntry>? Read(object? cache)
        {
            Reads++;
            return base.Read(cache);
        }
    }

    // --- Store descriptions: what the store IS and what actually backs it. ---

    [Fact]
    public void Memory_store_describes_itself_and_its_backing_type()
    {
        var (inspector, _, _) = Build();

        var store = inspector.GetStores().Single(s => s.Store == CacheStores.Memory);

        Assert.NotNull(store.Description);
        Assert.Contains("IMemoryCache", store.Description);
        Assert.Contains("MemoryCache", store.Description);
    }

    [Fact]
    public void Runtime_store_description_names_the_chain_actually_walked()
    {
        var (inspector, _, _) = Build();

        var store = inspector.GetStores().Single(s => s.Store == CacheStores.Runtime);

        Assert.NotNull(store.Description);
        Assert.Contains("AppCaches.RuntimeCache", store.Description);
        // Not a hardcoded sentence: the decorator the test actually constructed shows up.
        Assert.Contains("DeepCloneAppCache", store.Description);
        Assert.Contains("MemoryCache", store.Description);
    }

    [Fact]
    public void Description_is_present_even_when_keys_cannot_be_listed()
    {
        // The store the reader cannot enumerate is exactly the one where a reader most needs to be
        // told what it is, so the description must not be gated on KeysAvailable.
        var inspector = BuildWith(new UnreadableMemoryCache());

        var store = inspector.GetStores().Single(s => s.Store == CacheStores.Memory);

        Assert.False(store.KeysAvailable);
        Assert.NotNull(store.Description);
        Assert.Contains("IMemoryCache", store.Description);
    }

    [Fact]
    public void Entries_are_sorted_by_key()
    {
        var (inspector, memory, _) = Build();
        memory.Set("Zebra", "v");
        memory.Set("Apple", "v");

        var entries = inspector.GetStores()
            .Single(s => s.Store == CacheStores.Memory).Entries;

        Assert.Equal(new[] { "Apple", "Zebra" }, entries.Select(e => e.Key).ToArray());
    }
}
