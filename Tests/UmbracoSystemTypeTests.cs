using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Cache;
using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

/// <summary>
/// Umbraco's hybrid content cache keys its entries by GUID, so prefix matching on the KEY cannot
/// identify them. What gives them away is the value type — e.g.
/// <c>ImmutableCacheItem&lt;ContentCacheNode&gt;</c>, whose payload lives in
/// <c>Umbraco.Cms.Infrastructure.HybridCache</c>. These tests pin type-based detection.
/// </summary>
public class UmbracoSystemTypeTests
{
    private static UmbracoSystemKeyMatcher Build(params string[] extraNamespaces)
    {
        var values = new Dictionary<string, string?>();
        for (var i = 0; i < extraNamespaces.Length; i++)
        {
            values[$"CacheManager:SystemTypeNamespaces:{i}"] = extraNamespaces[i];
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return new UmbracoSystemKeyMatcher(configuration);
    }

    [Fact]
    public void Null_type_is_not_system() => Assert.False(Build().IsSystemType(null));

    [Fact]
    public void Umbraco_type_is_system()
        => Assert.True(Build().IsSystemType(typeof(ObjectCacheAppCache)));

    [Fact]
    public void Plain_framework_type_is_not_system()
        => Assert.False(Build().IsSystemType(typeof(string)));

    [Fact]
    public void User_collection_of_framework_types_is_not_system()
        => Assert.False(Build().IsSystemType(typeof(List<string>)));

    /// <summary>
    /// The real-world shape: a NON-Umbraco wrapper around an Umbraco payload. This is exactly
    /// <c>ImmutableCacheItem&lt;ContentCacheNode&gt;</c>, so it must be caught via the generic argument.
    /// </summary>
    [Fact]
    public void Non_umbraco_wrapper_around_umbraco_payload_is_system()
        => Assert.True(Build().IsSystemType(typeof(List<ObjectCacheAppCache>)));

    [Fact]
    public void Nested_generic_umbraco_payload_is_system()
        => Assert.True(Build().IsSystemType(typeof(Dictionary<string, List<ObjectCacheAppCache>>)));

    [Fact]
    public void Configured_namespace_is_matched()
        => Assert.True(Build("MyCompany.Internal").IsSystemType(typeof(string)) is false
            && Build("System").IsSystemType(typeof(string)));

    [Fact]
    public void Configured_namespaces_do_not_replace_the_umbraco_default()
        => Assert.True(Build("MyCompany.Internal").IsSystemType(typeof(ObjectCacheAppCache)));

    [Fact]
    public void Key_matching_still_works_independently()
        => Assert.True(Build().IsSystemKey("umbraco-dynamic-dashboard"));
}
