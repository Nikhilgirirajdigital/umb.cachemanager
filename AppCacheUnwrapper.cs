using System.Reflection;
using Microsoft.Extensions.Caching.Memory;
using Umbraco.Cms.Core.Cache;

namespace Umb.CacheManager;

/// <summary>
/// Peels Umbraco's <see cref="IAppCache"/> decorators (e.g. <c>DeepCloneAppCache</c> wrapping
/// <c>ObjectCacheAppCache</c>) down to the underlying <see cref="MemoryCache"/>.
///
/// In Umbraco 17 <c>ObjectCacheAppCache</c> is built on <see cref="MemoryCache"/> — NOT on
/// <c>System.Runtime.Caching.ObjectCache</c> as in the v13 lineage. That change is why the
/// previous <c>IEnumerable&lt;KeyValuePair&lt;string, object&gt;&gt;</c> test always failed and the
/// runtime store reported "keys unavailable".
/// </summary>
public static class AppCacheUnwrapper
{
    private const BindingFlags Members =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private const int MaxDepth = 6;

    public static MemoryCache? Unwrap(IAppCache? cache)
    {
        object? current = cache;

        for (var depth = 0; depth < MaxDepth && current is not null; depth++)
        {
            if (current is MemoryCache direct)
            {
                return direct;
            }

            var type = current.GetType();

            try
            {
                if (type.GetProperty("MemoryCache", Members)?.GetValue(current) is MemoryCache backing)
                {
                    return backing;
                }
            }
            catch
            {
                return null;
            }

            try
            {
                var innerField = type
                    .GetFields(Members)
                    .FirstOrDefault(f => typeof(IAppCache).IsAssignableFrom(f.FieldType));

                current = innerField?.GetValue(current);
            }
            catch
            {
                return null;
            }
        }

        return null;
    }

    /// <summary>
    /// Walks the same decorator chain as <see cref="Unwrap"/> but reports the path rather than the
    /// destination: the simple type name of each cache visited, ending at <c>MemoryCache</c> when
    /// the walk gets that far. Used for the store description the dashboard shows, so it reports
    /// what is actually there instead of a hardcoded assumption about Umbraco's internals.
    ///
    /// Best-effort like everything else on this reflection path: it never throws, and an empty or
    /// truncated list is a legitimate answer that simply yields a shorter description.
    /// </summary>
    public static IReadOnlyList<string> DescribeChain(IAppCache? cache)
    {
        var chain = new List<string>();
        object? current = cache;

        for (var depth = 0; depth < MaxDepth && current is not null; depth++)
        {
            chain.Add(current.GetType().Name);

            if (current is MemoryCache)
            {
                return chain;
            }

            var type = current.GetType();

            try
            {
                if (type.GetProperty("MemoryCache", Members)?.GetValue(current) is MemoryCache backing)
                {
                    chain.Add(backing.GetType().Name);
                    return chain;
                }
            }
            catch
            {
                return chain;
            }

            try
            {
                var innerField = type
                    .GetFields(Members)
                    .FirstOrDefault(f => typeof(IAppCache).IsAssignableFrom(f.FieldType));

                current = innerField?.GetValue(current);
            }
            catch
            {
                return chain;
            }
        }

        return chain;
    }
}
