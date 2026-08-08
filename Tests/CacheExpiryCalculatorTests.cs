using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

public class CacheExpiryCalculatorTests
{
    private static readonly DateTime LastAccessed = new(2026, 8, 3, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Metadata_unavailable_is_unknown()
    {
        var result = CacheExpiryCalculator.Compute(null, null, null, metadataAvailable: false);

        Assert.Equal(CacheExpiryKind.Unknown, result.Kind);
        Assert.Null(result.ExpiresAt);
    }

    [Fact]
    public void No_absolute_and_no_sliding_is_none()
    {
        var result = CacheExpiryCalculator.Compute(null, null, LastAccessed, metadataAvailable: true);

        Assert.Equal(CacheExpiryKind.None, result.Kind);
        Assert.Null(result.ExpiresAt);
    }

    [Fact]
    public void Absolute_only_returns_that_instant()
    {
        var absolute = new DateTimeOffset(2026, 8, 3, 12, 5, 0, TimeSpan.Zero);

        var result = CacheExpiryCalculator.Compute(absolute, null, LastAccessed, metadataAvailable: true);

        Assert.Equal(CacheExpiryKind.Absolute, result.Kind);
        Assert.Equal(absolute, result.ExpiresAt);
    }

    [Fact]
    public void Sliding_only_is_last_accessed_plus_window()
    {
        var result = CacheExpiryCalculator.Compute(
            null, TimeSpan.FromMinutes(10), LastAccessed, metadataAvailable: true);

        Assert.Equal(CacheExpiryKind.Sliding, result.Kind);
        Assert.Equal(new DateTimeOffset(2026, 8, 3, 12, 10, 0, TimeSpan.Zero), result.ExpiresAt);
    }

    [Fact]
    public void Sliding_without_last_accessed_is_unknown()
    {
        var result = CacheExpiryCalculator.Compute(
            null, TimeSpan.FromMinutes(10), null, metadataAvailable: true);

        Assert.Equal(CacheExpiryKind.Unknown, result.Kind);
        Assert.Null(result.ExpiresAt);
    }

    [Fact]
    public void Both_set_sliding_sooner_wins()
    {
        var absolute = new DateTimeOffset(2026, 8, 3, 13, 0, 0, TimeSpan.Zero);

        var result = CacheExpiryCalculator.Compute(
            absolute, TimeSpan.FromMinutes(5), LastAccessed, metadataAvailable: true);

        Assert.Equal(CacheExpiryKind.Sliding, result.Kind);
        Assert.Equal(new DateTimeOffset(2026, 8, 3, 12, 5, 0, TimeSpan.Zero), result.ExpiresAt);
    }

    [Fact]
    public void Both_set_absolute_sooner_wins()
    {
        var absolute = new DateTimeOffset(2026, 8, 3, 12, 2, 0, TimeSpan.Zero);

        var result = CacheExpiryCalculator.Compute(
            absolute, TimeSpan.FromMinutes(30), LastAccessed, metadataAvailable: true);

        Assert.Equal(CacheExpiryKind.Absolute, result.Kind);
        Assert.Equal(absolute, result.ExpiresAt);
    }

    [Fact]
    public void Unspecified_last_accessed_kind_is_treated_as_utc()
    {
        var unspecified = new DateTime(2026, 8, 3, 12, 0, 0, DateTimeKind.Unspecified);

        var result = CacheExpiryCalculator.Compute(
            null, TimeSpan.FromMinutes(1), unspecified, metadataAvailable: true);

        Assert.Equal(new DateTimeOffset(2026, 8, 3, 12, 1, 0, TimeSpan.Zero), result.ExpiresAt);
    }
}
