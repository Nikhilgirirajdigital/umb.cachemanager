namespace Umb.CacheManager;

/// <summary>How an entry's lifetime is governed. <see cref="None"/> ("never expires") and
/// <see cref="Unknown"/> ("could not be determined") are deliberately distinct.</summary>
public enum CacheExpiryKind
{
    None,
    Absolute,
    Sliding,
    Unknown
}

/// <param name="ExpiresAt">Absolute instant the entry expires, or null when none/unknown.</param>
public readonly record struct CacheExpiry(DateTimeOffset? ExpiresAt, CacheExpiryKind Kind);

/// <summary>
/// Resolves a cache entry's absolute and/or sliding window into a single expiry instant.
/// Pure: takes no ambient clock, so results are deterministic and directly testable. A sliding
/// window resolves to an absolute instant (<c>LastAccessed + window</c>), which is why no "now"
/// parameter is needed — the countdown is the client's job.
/// </summary>
public static class CacheExpiryCalculator
{
    public static CacheExpiry Compute(
        DateTimeOffset? absolute,
        TimeSpan? sliding,
        DateTime? lastAccessedUtc,
        bool metadataAvailable)
    {
        if (!metadataAvailable)
        {
            return new CacheExpiry(null, CacheExpiryKind.Unknown);
        }

        DateTimeOffset? slidingAt = null;
        if (sliding is { } window)
        {
            if (lastAccessedUtc is not { } lastAccessed)
            {
                // The entry does expire, but we cannot say when.
                return new CacheExpiry(null, CacheExpiryKind.Unknown);
            }

            slidingAt = new DateTimeOffset(DateTime.SpecifyKind(lastAccessed, DateTimeKind.Utc)) + window;
        }

        return (absolute, slidingAt) switch
        {
            (null, null) => new CacheExpiry(null, CacheExpiryKind.None),
            (null, { } s) => new CacheExpiry(s, CacheExpiryKind.Sliding),
            ({ } a, null) => new CacheExpiry(a, CacheExpiryKind.Absolute),
            ({ } a, { } s) when s < a => new CacheExpiry(s, CacheExpiryKind.Sliding),
            ({ } a, _) => new CacheExpiry(a, CacheExpiryKind.Absolute)
        };
    }
}
