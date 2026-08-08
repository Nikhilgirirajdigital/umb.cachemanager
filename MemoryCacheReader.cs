using System.Collections;
using System.Reflection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace Umb.CacheManager;

/// <summary>A cache entry as read from the runtime, before any interpretation.</summary>
/// <param name="Key">The key rendered as a string — what the API and the UI display.</param>
/// <param name="MetadataAvailable">
/// False when only the key could be recovered, so expiry is genuinely unknown rather than absent.
/// </param>
/// <param name="ObjectKey">
/// The ORIGINAL key object, exactly as the cache holds it. <see cref="IMemoryCache"/> is keyed by
/// <see cref="object"/>, not by string: ASP.NET Core MVC, Razor and DataProtection all cache under
/// composite key objects. Removing such an entry by <see cref="Key"/> (its <c>ToString()</c>)
/// silently matches nothing, so callers that want to REMOVE an entry must use this instead.
/// Null only when the key object itself was null.
/// </param>
public sealed record RawCacheEntry(
    string Key,
    object? Value,
    DateTimeOffset? AbsoluteExpiration,
    TimeSpan? SlidingExpiration,
    DateTime? LastAccessedUtc,
    bool MetadataAvailable,
    object? ObjectKey = null);

/// <summary>
/// One of two places in this package that use reflection — the other is
/// <see cref="AppCacheUnwrapper"/>, which peels Umbraco's cache decorators down to the
/// <see cref="MemoryCache"/> this class then reads. Reads that <see cref="MemoryCache"/>'s
/// entries and their expiry metadata.
///
/// Entry metadata is read through the PUBLIC <see cref="ICacheEntry"/> interface, so only the
/// private field names are version-sensitive, and each has a fallback:
///   1. <c>_coherentState</c> -> its entry dictionaries -> <see cref="ICacheEntry"/>. Full data.
///   2. a single <c>_entries</c> dictionary, for runtimes with the older shape. Full data.
///   3. the public <c>Keys</c> property (.NET 9+) -> keys only, metadata unavailable.
///   4. null -> the caller reports "keys unavailable".
///
/// Verified against .NET 10, where <c>CoherentState</c> holds TWO dictionaries
/// (<c>_stringEntries</c> and <c>_nonStringEntries</c>); both are read.
/// </summary>
public class MemoryCacheReader
{
    private const BindingFlags Members =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private readonly ILogger<MemoryCacheReader> _logger;

    public MemoryCacheReader(ILogger<MemoryCacheReader> logger) => _logger = logger;

    /// <summary>
    /// Virtual so tests can count enumerations — this class's whole cost story is "how many times
    /// did we walk the store", and that is only assertable by intercepting here.
    /// </summary>
    public virtual IReadOnlyList<RawCacheEntry>? Read(object? cache)
    {
        if (cache is null)
        {
            return null;
        }

        try
        {
            return ReadFromCoherentState(cache)
                ?? ReadFromEntriesField(cache)
                ?? ReadKeysOnly(cache);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read cache entries via reflection.");
            return null;
        }
    }

    private static IReadOnlyList<RawCacheEntry>? ReadFromCoherentState(object cache)
    {
        var state = cache.GetType().GetField("_coherentState", Members)?.GetValue(cache);
        if (state is null)
        {
            return null;
        }

        List<RawCacheEntry>? results = null;

        foreach (var field in state.GetType().GetFields(Members))
        {
            if (field.GetValue(state) is not IDictionary dictionary)
            {
                continue;
            }

            results ??= new List<RawCacheEntry>();
            AddEntries(dictionary, results);
        }

        return results;
    }

    private static IReadOnlyList<RawCacheEntry>? ReadFromEntriesField(object cache)
    {
        if (cache.GetType().GetField("_entries", Members)?.GetValue(cache) is not IDictionary dictionary)
        {
            return null;
        }

        var results = new List<RawCacheEntry>();
        AddEntries(dictionary, results);
        return results;
    }

    private static IReadOnlyList<RawCacheEntry>? ReadKeysOnly(object cache)
    {
        if (cache.GetType().GetProperty("Keys", BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(cache) is not IEnumerable<object> keys)
        {
            return null;
        }

        return keys
            .Select(k => new RawCacheEntry(
                k?.ToString() ?? string.Empty, null, null, null, null,
                MetadataAvailable: false, ObjectKey: k))
            .ToList();
    }

    private static void AddEntries(IDictionary dictionary, List<RawCacheEntry> results)
    {
        foreach (DictionaryEntry pair in dictionary)
        {
            var key = pair.Key?.ToString() ?? string.Empty;

            // CacheEntry is internal but implements the public ICacheEntry.
            if (pair.Value is not ICacheEntry entry)
            {
                // Key recovered, metadata not: still worth listing.
                results.Add(new RawCacheEntry(
                    key, null, null, null, null, MetadataAvailable: false, ObjectKey: pair.Key));
                continue;
            }

            results.Add(ReadEntry(key, entry, pair.Value, pair.Key));
        }
    }

    /// <summary>
    /// Reading any piece of an exotic entry's metadata can throw. A failure here must degrade
    /// only THIS entry to metadata-unavailable, never bubble up and cost the whole cache read
    /// (that would conflate "one odd entry" with "cache unreadable" — see <see cref="Read"/>).
    /// </summary>
    private static RawCacheEntry ReadEntry(string key, ICacheEntry entry, object rawEntry, object? objectKey)
    {
        try
        {
            return new RawCacheEntry(
                key,
                SafeValue(entry),
                entry.AbsoluteExpiration,
                entry.SlidingExpiration,
                ReadLastAccessed(rawEntry),
                MetadataAvailable: true,
                ObjectKey: objectKey);
        }
        catch
        {
            // Key recovered, metadata not: still worth listing.
            return new RawCacheEntry(
                key, null, null, null, null, MetadataAvailable: false, ObjectKey: objectKey);
        }
    }

    /// <summary>Reading a value can throw for exotic entries; a null value must not lose the key.</summary>
    private static object? SafeValue(ICacheEntry entry)
    {
        try
        {
            return entry.Value;
        }
        catch
        {
            return null;
        }
    }

    private static DateTime? ReadLastAccessed(object entry)
        => entry.GetType().GetProperty("LastAccessed", Members)?.GetValue(entry) as DateTime?;
}
