using Microsoft.Extensions.Configuration;

namespace Umb.CacheManager;

/// <summary>
/// Decides whether a cache key belongs to Umbraco's own internals (as opposed to a key the
/// host site's developer created). Matching is a case-insensitive prefix test against a
/// built-in default list merged with any extra prefixes the host adds under the
/// configuration key <c>CacheManager:SystemKeyPrefixes</c> (a string array).
///
/// This is a heuristic, not a contract: nothing is hidden server-side on the strength of it —
/// the UI merely defaults to hiding matches and can reveal them. So a false positive is always
/// recoverable, and a false negative just shows one extra key.
/// </summary>
public sealed class UmbracoSystemKeyMatcher
{
    // Prefixes observed in real Umbraco runtime/memory caches plus well-known internals.
    private static readonly string[] DefaultPrefixes =
    {
        "umbraco",              // Umbraco.Cms.*, Umbraco.Core.*, umbraco-dynamic-dashboard-*
        "umbrtmche-",           // Umbraco runtime member cache
        "keycache_",            // ContentTypeHandler / DataTypeHandler key caches
        "pcr_",                 // published content request
        "LocalizedTextService", // localization file sources
        "recycleBin_",          // recycle bin counts
        "UserAvatar",           // backoffice user avatars
        "cacheHelper",
        "AllContentTypes",
        "AllMediaTypes",
        "AllMemberTypes",
        "SqlMainDomCache",
        "NuCache",
    };

    // Some Umbraco internals cannot be recognised from their key at all. The hybrid content cache
    // keys every entry by the content's GUID, so a prefix test sees nothing to match — but the
    // VALUE is an Umbraco type (e.g. ImmutableCacheItem<ContentCacheNode>, whose payload lives in
    // Umbraco.Cms.Infrastructure.HybridCache). Namespace matching on the value type catches those.
    private static readonly string[] DefaultTypeNamespaces =
    {
        "Umbraco.",
        // Vendor roots are unambiguous, so matching them is precise rather than a guess. These two
        // ship in practically every Umbraco site; add your own via CacheManager:SystemTypeNamespaces.
        "OpenIddict.",
        "UrlTracker."
    };

    // Matched on the EXACT rendered type name, deliberately not the namespace. OpenIddict caches
    // ImmutableArray<String>, but ImmutableArray<Product> is the host's own data — a namespace rule
    // (System.Collections.Immutable) could not tell those apart and would hide real data.
    private static readonly string[] DefaultValueTypes = { "ImmutableArray<String>" };

    private readonly string[] _prefixes;
    private readonly string[] _typeNamespaces;
    private readonly string[] _valueTypes;
    private readonly string[] _myPrefixes;

    public UmbracoSystemKeyMatcher(IConfiguration configuration)
    {
        _prefixes = Merge(DefaultPrefixes, configuration, "CacheManager:SystemKeyPrefixes");
        _typeNamespaces = Merge(DefaultTypeNamespaces, configuration, "CacheManager:SystemTypeNamespaces");
        _valueTypes = Merge(DefaultValueTypes, configuration, "CacheManager:SystemValueTypes");
        _myPrefixes = Merge(Array.Empty<string>(), configuration, "CacheManager:MyKeyPrefixes");
    }

    /// <summary>
    /// Decides whether an entry belongs to the platform rather than to the host site's own code.
    ///
    /// TWO MODES, because blocklisting cannot converge. Every package invents its own key
    /// convention — Umbraco's hybrid cache uses bare GUIDs, OpenIddict a GUID plus a JSON array,
    /// UrlTracker an <c>ic:</c> prefix — and the next package installed will invent another. So:
    ///
    /// <list type="bullet">
    /// <item>
    /// <b>Allowlist (preferred).</b> When the host declares <c>CacheManager:MyKeyPrefixes</c>,
    /// those prefixes ARE the host's cache and everything else is platform. Nothing new ever needs
    /// to be recognised, and a host prefix wins even when the cached value is an Umbraco type —
    /// caching Umbraco entities under your own key is legitimate.
    /// </item>
    /// <item>
    /// <b>Heuristic fallback.</b> With nothing declared, fall back to matching known platform key
    /// prefixes and platform value-type namespaces, so the dashboard is still useful uninstalled
    /// and unconfigured. It will miss third-party caches — that is the cost of not declaring.
    /// </item>
    /// </list>
    /// </summary>
    public bool IsSystemEntry(string key, Type? valueType)
        => _myPrefixes.Length > 0
            ? !MatchesAnyPrefix(key, _myPrefixes)
            : IsSystemKey(key)
              || IsCompositeGuidKey(key)
              || IsSystemValueType(valueType)
              || IsSystemType(valueType);

    /// <summary>
    /// True when the cached value's rendered type name is one the host considers platform noise —
    /// by default <c>ImmutableArray&lt;String&gt;</c>, which is what OpenIddict stores.
    ///
    /// Compared on the exact rendered name so the generic ARGUMENT still discriminates:
    /// <c>ImmutableArray&lt;Product&gt;</c> is the host's own data and stays visible. Extend via
    /// <c>CacheManager:SystemValueTypes</c>.
    /// </summary>
    public bool IsSystemValueType(Type? valueType)
    {
        if (valueType is null || _valueTypes.Length == 0)
        {
            return false;
        }

        var rendered = TypeNameFormatter.Format(valueType);
        if (rendered is null)
        {
            return false;
        }

        foreach (var candidate in _valueTypes)
        {
            if (string.Equals(rendered, candidate, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Matches OpenIddict's composite cache key: a GUID immediately followed by a JSON array, e.g.
    /// <c>851d6f08-…-ab864611ecaa["https://site/umbraco/oauth_complete"]</c>.
    ///
    /// OpenIddict is Umbraco 17's backoffice auth server, so these appear on EVERY site, and they
    /// cannot be recognised any other way: the cached value is a bare
    /// <c>ImmutableArray&lt;String&gt;</c>, a BCL type indistinguishable from something the host
    /// might legitimately cache.
    ///
    /// Deliberately narrow — a BARE GUID key does not match. Caching by node or entity GUID is a
    /// perfectly normal thing for a site to do, and hiding those would be worse than the noise.
    /// </summary>
    private static bool IsCompositeGuidKey(string key)
        => key.Length > 36
            && key[36] == '['
            && Guid.TryParseExact(key[..36], "D", out _);

    private static string[] Merge(string[] defaults, IConfiguration configuration, string section)
    {
        var extra = configuration.GetSection(section).Get<string[]>() ?? Array.Empty<string>();

        return defaults
            .Concat(extra)
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    /// <summary>True if <paramref name="key"/> starts with any known Umbraco system prefix.</summary>
    public bool IsSystemKey(string key)
    {
        if (string.IsNullOrEmpty(key))
        {
            return false;
        }

        return MatchesAnyPrefix(key, _prefixes);
    }

    private static bool MatchesAnyPrefix(string key, string[] prefixes)
    {
        if (string.IsNullOrEmpty(key))
        {
            return false;
        }

        foreach (var prefix in prefixes)
        {
            if (key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// True when a cached VALUE is one of Umbraco's own types, judged by namespace.
    ///
    /// Generic arguments are inspected recursively, because the telling type is often the payload
    /// rather than the wrapper: <c>ImmutableCacheItem&lt;ContentCacheNode&gt;</c> is a neutral
    /// container around an Umbraco type, and it is the container Umbraco's content cache stores
    /// under a bare GUID key.
    /// </summary>
    public bool IsSystemType(Type? type) => IsSystemType(type, depth: 0);

    private bool IsSystemType(Type? type, int depth)
    {
        // Generic nesting is finite, but a cheap bound keeps a pathological type from spinning.
        if (type is null || depth > 8)
        {
            return false;
        }

        var ns = type.Namespace;
        if (ns is not null)
        {
            foreach (var candidate in _typeNamespaces)
            {
                if (ns.StartsWith(candidate, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        if (!type.IsGenericType)
        {
            return false;
        }

        foreach (var argument in type.GetGenericArguments())
        {
            if (IsSystemType(argument, depth + 1))
            {
                return true;
            }
        }

        return false;
    }
}
