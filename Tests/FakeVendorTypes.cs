// Stand-ins for third-party types the matcher classifies by NAMESPACE. Only the namespace matters,
// so these avoid taking a real dependency on the vendor packages just to test the rule.

namespace UrlTracker.Core.Models;

internal sealed class FakeRedirect;
