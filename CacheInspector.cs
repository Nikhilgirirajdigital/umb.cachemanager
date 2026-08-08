using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Cache;

namespace Umb.CacheManager;

/// <summary>Store identifiers used across the API and the frontend.</summary>
public static class CacheStores
{
    public const string Runtime = "runtime";
    public const string Memory = "memory";
}

// NOTE ON WIRE CASING (the reverse of the v13 package):
// The v13 backoffice serialized with Newtonsoft.Json, which IGNORED these [JsonPropertyName]
// attributes, so the live wire casing there was C# PascalCase. Umbraco 17's Management API
// serializes with System.Text.Json, which HONOURS these attributes — so the wire casing here
// is the camelCase the attributes declare.
public sealed class CacheEntryInfo
{
    [JsonPropertyName("key")] public string Key { get; set; } = string.Empty;
    [JsonPropertyName("valueType")] public string? ValueType { get; set; }

    /// <summary>True when the key matches an Umbraco internal prefix; the UI groups these separately.</summary>
    [JsonPropertyName("isSystem")] public bool IsSystem { get; set; }

    /// <summary>Absolute ISO-8601 UTC instant the entry expires; null when it never expires or is unknown.</summary>
    [JsonPropertyName("expiresAt")] public string? ExpiresAt { get; set; }

    /// <summary>One of: absolute, sliding, none, unknown.</summary>
    [JsonPropertyName("expiryKind")] public string ExpiryKind { get; set; } = "unknown";
}

public sealed class CacheStoreInfo
{
    [JsonPropertyName("store")] public string Store { get; set; } = string.Empty;
    [JsonPropertyName("displayName")] public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Human-readable explanation of what this store is and which concrete type backs it. The
    /// backing type is DISCOVERED at runtime rather than hardcoded, so it stays truthful if a
    /// future Umbraco release changes the decorator chain.
    /// </summary>
    [JsonPropertyName("description")] public string? Description { get; set; }

    /// <summary>Whether the store's keys could be listed. False -&gt; UI shows "keys unavailable".</summary>
    [JsonPropertyName("keysAvailable")] public bool KeysAvailable { get; set; }
    [JsonPropertyName("count")] public int Count { get; set; }
    [JsonPropertyName("note")] public string? Note { get; set; }
    [JsonPropertyName("entries")] public List<CacheEntryInfo> Entries { get; set; } = new();
}

/// <summary>One entry, identified by the store it lives in and its displayed key.</summary>
public sealed class CacheKeyRef
{
    [JsonPropertyName("store")] public string Store { get; set; } = string.Empty;
    [JsonPropertyName("key")] public string Key { get; set; } = string.Empty;
}

/// <summary>
/// Outcome of a batch clear. <see cref="Failed"/> holds the entries CONFIRMED still present
/// afterwards — the batch equivalent of <c>ClearKey</c> returning false.
/// </summary>
public sealed class ClearKeysResult
{
    [JsonPropertyName("cleared")] public int Cleared { get; set; }
    [JsonPropertyName("failed")] public List<CacheKeyRef> Failed { get; set; } = new();
}

/// <summary>
/// Inspects the two in-process cache stores every Umbraco site has: the Umbraco runtime cache
/// (<see cref="AppCaches.RuntimeCache"/>) and the ASP.NET Core <see cref="IMemoryCache"/>. In
/// Umbraco 17 both are backed by the same <see cref="MemoryCache"/> type, so one read path serves
/// both. Orchestration only — reflection lives in <see cref="MemoryCacheReader"/> and
/// <see cref="AppCacheUnwrapper"/>.
/// </summary>
public sealed class CacheInspector
{
    private const string UnavailableNote = "Keys could not be enumerated on this runtime.";

    private readonly AppCaches _appCaches;
    private readonly IMemoryCache _memoryCache;
    private readonly UmbracoSystemKeyMatcher _systemKeys;
    private readonly MemoryCacheReader _reader;
    private readonly ILogger<CacheInspector> _logger;

    public CacheInspector(
        AppCaches appCaches,
        IMemoryCache memoryCache,
        UmbracoSystemKeyMatcher systemKeys,
        MemoryCacheReader reader,
        ILogger<CacheInspector> logger)
    {
        _appCaches = appCaches;
        _memoryCache = memoryCache;
        _systemKeys = systemKeys;
        _reader = reader;
        _logger = logger;
    }

    /// <summary>
    /// Stores in DISPLAY order — the dashboard renders them as received. The ASP.NET Core memory
    /// cache leads because that is where a site's own caches most often live; Umbraco's runtime
    /// cache follows. Order is pinned by a test, so change it here rather than in the element.
    /// </summary>
    public IReadOnlyList<CacheStoreInfo> GetStores() =>
    [
        BuildStore(CacheStores.Memory, "ASP.NET Core Memory Cache", MemoryDescription(), _memoryCache),
        BuildStore(CacheStores.Runtime, "Umbraco Runtime Cache", RuntimeDescription(), RuntimeBackingCache())
    ];

    private const string MemoryProse =
        "The IMemoryCache singleton ASP.NET Core registers — the cache your own code gets by " +
        "injecting IMemoryCache.";

    private const string RuntimeProse =
        "Umbraco's AppCaches.RuntimeCache (IAppCache), used by Umbraco for content, media and " +
        "published data.";

    private string MemoryDescription() => WithBacking(MemoryProse, [_memoryCache.GetType().Name]);

    private string RuntimeDescription()
    {
        try
        {
            return WithBacking(RuntimeProse, AppCacheUnwrapper.DescribeChain(_appCaches.RuntimeCache));
        }
        catch (Exception ex)
        {
            // A missing backing clause is a far better outcome than a dashboard that fails to load.
            _logger.LogWarning(ex, "Could not describe the runtime cache chain.");
            return RuntimeProse;
        }
    }

    private static string WithBacking(string prose, IReadOnlyList<string> chain) =>
        chain.Count == 0 ? prose : $"{prose} Backed by: {string.Join(" → ", chain)}.";

    private object? RuntimeBackingCache()
    {
        try
        {
            return AppCacheUnwrapper.Unwrap(_appCaches.RuntimeCache);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not unwrap the Umbraco runtime cache.");
            return null;
        }
    }

    private CacheStoreInfo BuildStore(string store, string displayName, string description, object? backing)
    {
        var info = new CacheStoreInfo
        {
            Store = store,
            DisplayName = displayName,
            Description = description
        };

        var raw = _reader.Read(backing);
        if (raw is null)
        {
            info.KeysAvailable = false;
            info.Note = UnavailableNote;
            return info;
        }

        foreach (var entry in raw)
        {
            var expiry = CacheExpiryCalculator.Compute(
                entry.AbsoluteExpiration,
                entry.SlidingExpiration,
                entry.LastAccessedUtc,
                entry.MetadataAvailable);

            // Not entry.Value.GetType(): Umbraco wraps runtime-cache values in Lazy<object>, so the
            // wrapper type would be reported for every entry. Never forces the lazy.
            var valueType = TypeNameFormatter.ResolveValueType(entry.Value);

            info.Entries.Add(new CacheEntryInfo
            {
                Key = entry.Key,
                ValueType = TypeNameFormatter.Format(valueType),
                // Allowlist when the host declared CacheManager:MyKeyPrefixes, heuristic otherwise.
                IsSystem = _systemKeys.IsSystemEntry(entry.Key, valueType),
                ExpiresAt = expiry.ExpiresAt?.UtcDateTime.ToString("o"),
                ExpiryKind = expiry.Kind.ToString().ToLowerInvariant()
            });
        }

        info.Entries.Sort((a, b) => string.CompareOrdinal(a.Key, b.Key));
        info.KeysAvailable = true;
        info.Count = info.Entries.Count;
        return info;
    }

    /// <summary>
    /// Removes a single key from a store and then CONFIRMS the removal by re-reading the store.
    /// </summary>
    /// <returns>
    /// True when no entry with that key remains. False when one survived the clear — the caller
    /// must not report success in that case.
    /// </returns>
    /// <exception cref="ArgumentOutOfRangeException">The store name is not known.</exception>
    public bool ClearKey(string store, string key)
    {
        RequireKnownStore(store);
        Remove(store, key, store == CacheStores.Memory ? _reader.Read(_memoryCache) : null);
        return !StillPresent(store, key);
    }

    /// <summary>
    /// Clears an explicit set of keys, which may span both stores, and confirms each removal.
    ///
    /// Cost is TWO enumerations per store involved, whatever the batch size: one snapshot before
    /// removing (so object-keyed memory entries can be removed by their original key — see
    /// <see cref="Remove"/>) and one verification read afterwards. That is the whole reason this
    /// exists rather than the client looping the single-key endpoint.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">
    /// Any item names an unknown store. Validated up front, so a bad item cannot leave the batch
    /// half-applied.
    /// </exception>
    public ClearKeysResult ClearKeys(IReadOnlyCollection<CacheKeyRef> items)
    {
        foreach (var item in items)
        {
            RequireKnownStore(item.Store);
        }

        var result = new ClearKeysResult();

        foreach (var group in items.GroupBy(i => i.Store, StringComparer.Ordinal))
        {
            var keys = group.Select(i => i.Key).Distinct(StringComparer.Ordinal).ToList();

            // One enumeration for the whole group instead of one per key.
            var snapshot = group.Key == CacheStores.Memory ? _reader.Read(_memoryCache) : null;

            foreach (var key in keys)
            {
                try
                {
                    Remove(group.Key, key, snapshot);
                }
                catch (Exception ex)
                {
                    // One bad key must not abort the rest of the batch; the verification read
                    // below is what decides whether it counts as cleared.
                    _logger.LogWarning(ex, "Could not clear cache key '{Key}' from '{Store}'.",
                        key, group.Key);
                }
            }

            var survivors = SurvivingKeys(group.Key);

            foreach (var key in keys)
            {
                if (survivors?.Contains(key) == true)
                {
                    result.Failed.Add(new CacheKeyRef { Store = group.Key, Key = key });
                }
                else
                {
                    // A store that cannot be re-read cannot contradict the clear — the same
                    // best-effort rule StillPresent already applies.
                    result.Cleared++;
                }
            }
        }

        return result;
    }

    private static void RequireKnownStore(string store)
    {
        if (store is not (CacheStores.Runtime or CacheStores.Memory))
        {
            throw new ArgumentOutOfRangeException(nameof(store), store, "Unknown cache store.");
        }
    }

    /// <param name="memorySnapshot">
    /// Entries read from the memory store just before this call, used to recover original key
    /// objects. Null means "not available" — we then fall back to removing by the string key.
    /// Passed in rather than re-read here so a batch clear costs ONE enumeration, not one per key.
    /// </param>
    private void Remove(string store, string key, IReadOnlyList<RawCacheEntry>? memorySnapshot)
    {
        if (store == CacheStores.Runtime)
        {
            // IAppCache is string-keyed end to end, so the displayed key IS the real key.
            _appCaches.RuntimeCache.Clear(key);
            return;
        }

        // IMemoryCache is keyed by object. We list entries by the key's ToString(), so removing by
        // that string misses every entry keyed by a non-string object (ASP.NET Core MVC, Razor and
        // DataProtection all do this) — the entry would survive while we reported success. Remove
        // by the ORIGINAL key object captured during the read instead.
        var originals = memorySnapshot?
            .Where(e => e.Key == key && e.ObjectKey is not null)
            .Select(e => e.ObjectKey!)
            .ToList();

        if (originals is { Count: > 0 })
        {
            // Two distinct key objects can render to the same string, and the dashboard shows them
            // as ONE row with ONE Clear button — the request is ambiguous by construction. We
            // remove every match: over-clearing exactly what the user pointed at is defensible,
            // leaving one behind while reporting success is not.
            foreach (var original in originals)
            {
                _memoryCache.Remove(original);
            }

            return;
        }

        // No snapshot (store unreadable) or no match: the plain string key is all we have, and it
        // is the correct key for the overwhelmingly common string-keyed entry.
        _memoryCache.Remove(key);
    }

    /// <summary>
    /// Whether an entry with this key survives in the store. A store that cannot be enumerated
    /// cannot contradict the clear, so it reports "gone" — best-effort, as everywhere else here.
    /// </summary>
    private bool StillPresent(string store, string key) =>
        SurvivingKeys(store)?.Contains(key) ?? false;

    private IReadOnlyCollection<string>? SurvivingKeys(string store)
    {
        var entries = store == CacheStores.Memory
            ? _reader.Read(_memoryCache)
            : _reader.Read(RuntimeBackingCache());

        return entries is null ? null : entries.Select(e => e.Key).ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>
    /// Clears every entry whose key is NOT an Umbraco system key. A null <paramref name="store"/>
    /// clears both stores. Returns how many of the targeted entries are confirmed gone afterwards
    /// (a store that cannot be re-read counts its targets as cleared). A failure on one key does
    /// not abort the rest.
    /// </summary>
    public int ClearCustom(string? store) => ClearWhere(store, e => !e.IsSystem);

    /// <summary>
    /// Clears every entry whose key IS an Umbraco system key — the exact complement of
    /// <see cref="ClearCustom"/>. A null <paramref name="store"/> clears both stores.
    /// </summary>
    public int ClearSystem(string? store) => ClearWhere(store, e => e.IsSystem);

    /// <summary>
    /// Removes every entry matching <paramref name="match"/>, one store or both.
    ///
    /// NOT interchangeable with <see cref="ClearAll"/>: this walks <see cref="GetStores"/>, so it
    /// only reaches entries it can ENUMERATE and skips a store reporting
    /// <see cref="CacheStoreInfo.KeysAvailable"/> false entirely. ClearAll uses each store's native
    /// Clear() and therefore also drops entries that cannot be listed.
    /// </summary>
    private int ClearWhere(string? store, Func<CacheEntryInfo, bool> match)
    {
        var cleared = 0;

        foreach (var info in GetStores())
        {
            if (store is not null && info.Store != store)
            {
                continue;
            }

            if (!info.KeysAvailable)
            {
                continue;
            }

            var targets = info.Entries.Where(match).Select(e => e.Key).ToList();
            if (targets.Count == 0)
            {
                continue;
            }

            // One enumeration for the whole batch instead of one per key.
            var snapshot = info.Store == CacheStores.Memory ? _reader.Read(_memoryCache) : null;

            foreach (var key in targets)
            {
                try
                {
                    Remove(info.Store, key, snapshot);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not clear cache key '{Key}' from '{Store}'.",
                        key, info.Store);
                }
            }

            var survivors = SurvivingKeys(info.Store);
            cleared += survivors is null
                ? targets.Count
                : targets.Count(k => !survivors.Contains(k));
        }

        return cleared;
    }

    /// <summary>Clears every entry in both stores using each store's native clear.</summary>
    public void ClearAll()
    {
        _appCaches.RuntimeCache.Clear();

        if (_memoryCache is MemoryCache concrete)
        {
            concrete.Clear();
        }
        else
        {
            // By the original key object, not its string rendering — see Remove().
            foreach (var entry in _reader.Read(_memoryCache) ?? [])
            {
                _memoryCache.Remove(entry.ObjectKey ?? entry.Key);
            }
        }
    }
}
