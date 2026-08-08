using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umb.CacheManager;

/// <summary>
/// Auto-discovered by Umbraco on startup. Registers the cache inspector so the package works
/// on install with no changes to the host site's DI wiring.
/// </summary>
public sealed class CacheManagerComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddSingleton<UmbracoSystemKeyMatcher>();
        builder.Services.AddSingleton<MemoryCacheReader>();
        builder.Services.AddSingleton<CacheInspector>();
    }
}
