using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// The batch-clear validation rules. Tested against the pure static rather than through the
/// controller action, because <c>ControllerBase.Problem()</c> needs an <c>HttpContext</c> a unit
/// test would have to fabricate — and the rules, not the plumbing, are what is worth pinning.
/// </summary>
public class ClearKeysRequestTests
{
    private static ClearKeysRequest With(params CacheKeyRef[] items) =>
        new() { Items = [.. items] };

    private static CacheKeyRef Ref(string store, string key) => new() { Store = store, Key = key };

    [Fact]
    public void Accepts_a_valid_batch()
    {
        var request = With(
            Ref(CacheStores.Memory, "MySite.A"),
            Ref(CacheStores.Runtime, "MySite.B"));

        Assert.Null(ClearKeysRequest.Validate(request));
    }

    [Fact]
    public void Rejects_a_null_request() => Assert.NotNull(ClearKeysRequest.Validate(null));

    [Fact]
    public void Rejects_an_empty_batch() => Assert.NotNull(ClearKeysRequest.Validate(With()));

    [Fact]
    public void Rejects_an_unknown_store()
    {
        var error = ClearKeysRequest.Validate(With(Ref("nope", "MySite.A")));

        Assert.NotNull(error);
        Assert.Contains("nope", error);
    }

    [Fact]
    public void Rejects_a_blank_key()
    {
        Assert.NotNull(ClearKeysRequest.Validate(With(Ref(CacheStores.Memory, "   "))));
    }

    [Fact]
    public void Rejects_a_batch_over_the_cap()
    {
        var request = new ClearKeysRequest
        {
            Items = Enumerable.Range(0, ClearKeysRequest.MaxItems + 1)
                .Select(i => Ref(CacheStores.Memory, $"MySite.{i}"))
                .ToList()
        };

        Assert.NotNull(ClearKeysRequest.Validate(request));
    }

    [Fact]
    public void Accepts_a_batch_exactly_at_the_cap()
    {
        var request = new ClearKeysRequest
        {
            Items = Enumerable.Range(0, ClearKeysRequest.MaxItems)
                .Select(i => Ref(CacheStores.Memory, $"MySite.{i}"))
                .ToList()
        };

        Assert.Null(ClearKeysRequest.Validate(request));
    }
}
