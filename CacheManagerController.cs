using System.Text.Json.Serialization;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;

namespace Umb.CacheManager;

/// <summary>
/// Body of a batch clear. Validation is a pure static so the rules can be tested without
/// fabricating an <see cref="HttpContext"/> for <c>ControllerBase.Problem()</c>.
/// </summary>
public sealed class ClearKeysRequest
{
    /// <summary>
    /// Upper bound on one request — a guard against an accidental unbounded batch, far above any
    /// plausible hand-selection in the dashboard.
    /// </summary>
    public const int MaxItems = 1000;

    [JsonPropertyName("items")] public List<CacheKeyRef> Items { get; set; } = new();

    /// <returns>Null when the request is valid; otherwise the message to return as a 400.</returns>
    public static string? Validate(ClearKeysRequest? request)
    {
        if (request?.Items is not { Count: > 0 })
        {
            return "At least one cache key is required.";
        }

        if (request.Items.Count > MaxItems)
        {
            return $"Too many keys in one request (max {MaxItems}).";
        }

        foreach (var item in request.Items)
        {
            if (string.IsNullOrWhiteSpace(item.Key))
            {
                return "Every item needs a key.";
            }

            if (item.Store is not (CacheStores.Runtime or CacheStores.Memory))
            {
                return $"Unknown cache store '{item.Store}'.";
            }
        }

        return null;
    }
}

/// <summary>
/// Umbraco 17 Management API controller for the Cache Manager dashboard. Secured with the
/// Settings-section policy (same gate as the v13 package) on top of the backoffice
/// authentication that <see cref="ManagementApiControllerBase"/> already enforces.
///
/// Routes resolve under
/// <c>/umbraco/management/api/v1/cache-manager/{caches|key|keys|custom|system|all}</c>.
/// Thin: delegates to <see cref="CacheInspector"/> and wraps failures in a typed problem result.
/// </summary>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("cache-manager")]
[ApiExplorerSettings(GroupName = "Cache Manager")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessSettings)]
public sealed class CacheManagerController : ManagementApiControllerBase
{
    private readonly CacheInspector _inspector;
    private readonly ILogger<CacheManagerController> _logger;

    public CacheManagerController(CacheInspector inspector, ILogger<CacheManagerController> logger)
    {
        _inspector = inspector;
        _logger = logger;
    }

    /// <summary>Lists both cache stores and their (enumerable) entries.</summary>
    [HttpGet("caches")]
    [ProducesResponseType(typeof(IReadOnlyList<CacheStoreInfo>), StatusCodes.Status200OK)]
    public IActionResult GetCaches()
    {
        try
        {
            return Ok(_inspector.GetStores());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read caches.");
            return Problem("Failed to read caches.", statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>Clears a single key from the given store.</summary>
    [HttpDelete("key")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public IActionResult ClearKey([FromQuery] string store, [FromQuery] string key)
    {
        if (string.IsNullOrWhiteSpace(store) || string.IsNullOrWhiteSpace(key))
        {
            return BadRequest(new { message = "Store and key are required." });
        }

        try
        {
            // Only 200 when the inspector CONFIRMED the entry is gone. Reporting success while the
            // entry is still cached would be worse than reporting the failure.
            if (!_inspector.ClearKey(store, key))
            {
                _logger.LogWarning("Cache key '{Key}' survived the clear in store '{Store}'.", key, store);
                return Problem($"'{key}' is still in the cache after the clear.",
                    statusCode: StatusCodes.Status409Conflict);
            }

            _logger.LogInformation("Cleared cache key '{Key}' from store '{Store}'.", key, store);
            return Ok(new { message = $"Cleared '{key}'." });
        }
        catch (ArgumentOutOfRangeException)
        {
            return BadRequest(new { message = $"Unknown cache store '{store}'." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear cache key '{Key}' from store '{Store}'.", key, store);
            return Problem($"Failed to clear '{key}'.", statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>Clears an explicit set of keys, which may span both stores.</summary>
    [HttpDelete("keys")]
    [ProducesResponseType(typeof(ClearKeysResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public IActionResult ClearKeys([FromBody] ClearKeysRequest? request)
    {
        var error = ClearKeysRequest.Validate(request);
        if (error is not null)
        {
            return BadRequest(new { message = error });
        }

        try
        {
            var result = _inspector.ClearKeys(request!.Items);

            // Nothing cleared at all is a failure, not a partial success — the same rule ClearKey
            // applies for one key. A partial success stays 200 and reports what survived, because
            // the backoffice notification layer treats any non-2xx as an outright error.
            if (result.Cleared == 0)
            {
                _logger.LogWarning("All {Count} selected cache keys survived the clear.",
                    result.Failed.Count);
                return Problem($"None of the {result.Failed.Count} selected entries could be cleared.",
                    statusCode: StatusCodes.Status409Conflict);
            }

            _logger.LogInformation("Cleared {Cleared} selected cache entries; {Failed} survived.",
                result.Cleared, result.Failed.Count);

            var message = $"Cleared {result.Cleared} entr{(result.Cleared == 1 ? "y" : "ies")}." +
                (result.Failed.Count > 0
                    ? $" {result.Failed.Count} could not be cleared."
                    : string.Empty);

            return Ok(new { message, cleared = result.Cleared, failed = result.Failed });
        }
        catch (ArgumentOutOfRangeException)
        {
            return BadRequest(new { message = "Unknown cache store in the request." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear the selected cache keys.");
            return Problem("Failed to clear the selected entries.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>Clears every entry in both stores.</summary>
    [HttpDelete("all")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult ClearAll()
    {
        try
        {
            _inspector.ClearAll();
            _logger.LogInformation("Cleared all caches.");
            return Ok(new { message = "All caches cleared." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear all caches.");
            return Problem("Failed to clear all caches.", statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>Clears every non-system ("your project's") key. Omit the store to clear both.</summary>
    [HttpDelete("custom")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult ClearCustom([FromQuery] string? store)
    {
        if (store is not null && store != CacheStores.Runtime && store != CacheStores.Memory)
        {
            return BadRequest(new { message = $"Unknown cache store '{store}'." });
        }

        try
        {
            var cleared = _inspector.ClearCustom(store);
            _logger.LogInformation("Cleared {Count} custom cache entries from '{Store}'.",
                cleared, store ?? "all stores");
            return Ok(new { message = $"Cleared {cleared} entr{(cleared == 1 ? "y" : "ies")}.", cleared });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear custom cache entries.");
            return Problem("Failed to clear custom cache entries.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>
    /// Clears every Umbraco/system key — the complement of <see cref="ClearCustom"/>. Omit the
    /// store to clear both. Weaker than <see cref="ClearAll"/> by construction: it can only remove
    /// entries the store lets us enumerate.
    /// </summary>
    [HttpDelete("system")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult ClearSystem([FromQuery] string? store)
    {
        if (store is not null && store != CacheStores.Runtime && store != CacheStores.Memory)
        {
            return BadRequest(new { message = $"Unknown cache store '{store}'." });
        }

        try
        {
            var cleared = _inspector.ClearSystem(store);
            _logger.LogInformation("Cleared {Count} system cache entries from '{Store}'.",
                cleared, store ?? "all stores");
            return Ok(new { message = $"Cleared {cleared} entr{(cleared == 1 ? "y" : "ies")}.", cleared });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to clear system cache entries.");
            return Problem("Failed to clear system cache entries.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
    }
}
