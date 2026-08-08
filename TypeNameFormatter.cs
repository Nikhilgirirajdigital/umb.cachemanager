using System.Reflection;

namespace Umb.CacheManager;

/// <summary>Renders a runtime type as a readable name: <c>List`1</c> becomes <c>List&lt;NavItem&gt;</c>.</summary>
public static class TypeNameFormatter
{
    private const BindingFlags PublicInstance = BindingFlags.Public | BindingFlags.Instance;

    /// <summary>
    /// Names the type of a CACHED VALUE, which is what the dashboard's Type column shows.
    ///
    /// Umbraco's <c>ObjectCacheAppCache</c> stores every runtime-cache value wrapped in a
    /// <see cref="Lazy{T}"/>, so the naive <c>value.GetType()</c> reports <c>Lazy&lt;Object&gt;</c>
    /// for every single entry in the store where the user's own caches live — useless. Where the
    /// wrapper has already produced its value we name the value INSIDE it instead.
    ///
    /// The lazy is NEVER forced: this runs during a read-only inspection, and forcing an
    /// uncreated <see cref="Lazy{T}"/> would execute arbitrary factory code (and its side effects)
    /// just because someone opened a dashboard. An uncreated — or unreadable — wrapper falls back
    /// to the wrapper's own type name, which is still truthful about what is stored.
    /// </summary>
    public static string? FormatValueType(object? value) => Format(ResolveValueType(value));

    /// <summary>
    /// The type a cached value should be JUDGED by — the same one <see cref="FormatValueType"/>
    /// names. Callers that classify entries (rather than display them) need the
    /// <see cref="Type"/> itself, and both must agree or an entry could be labelled by one type
    /// and displayed as another.
    /// </summary>
    public static Type? ResolveValueType(object? value)
    {
        if (value is null)
        {
            return null;
        }

        var type = value.GetType();
        if (!type.IsGenericType || type.GetGenericTypeDefinition() != typeof(Lazy<>))
        {
            return type;
        }

        try
        {
            // IsValueCreated is a plain flag read — it does not trigger the factory.
            if (type.GetProperty(nameof(Lazy<object>.IsValueCreated), PublicInstance)
                    ?.GetValue(value) is not true)
            {
                return type;
            }

            // Safe now: the value exists, so this getter just hands it back.
            var inner = type.GetProperty(nameof(Lazy<object>.Value), PublicInstance)?.GetValue(value);
            return inner?.GetType() ?? type;
        }
        catch
        {
            // A faulted or exotic lazy must not cost us the entry's type entirely.
            return type;
        }
    }

    public static string? Format(Type? type)
    {
        if (type is null)
        {
            return null;
        }

        if (!type.IsGenericType)
        {
            return type.Name;
        }

        var name = type.Name;
        var tick = name.IndexOf('`');
        if (tick > 0)
        {
            name = name[..tick];
        }

        var arguments = type.GetGenericArguments().Select(Format);
        return $"{name}<{string.Join(", ", arguments)}>";
    }
}
