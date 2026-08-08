using Umb.CacheManager;
using Xunit;

namespace Umb.CacheManager.Tests;

public class TypeNameFormatterTests
{
    [Fact]
    public void Null_type_returns_null() => Assert.Null(TypeNameFormatter.Format(null));

    [Fact]
    public void Simple_type_returns_short_name()
        => Assert.Equal("String", TypeNameFormatter.Format(typeof(string)));

    [Fact]
    public void Generic_type_is_expanded()
        => Assert.Equal("List<String>", TypeNameFormatter.Format(typeof(List<string>)));

    [Fact]
    public void Nested_generic_type_is_expanded()
        => Assert.Equal(
            "Dictionary<String, List<Int32>>",
            TypeNameFormatter.Format(typeof(Dictionary<string, List<int>>)));

    // --- FormatValueType: the Lazy<> unwrapping the dashboard's Type column depends on. ---

    [Fact]
    public void Value_type_of_null_is_null() => Assert.Null(TypeNameFormatter.FormatValueType(null));

    [Fact]
    public void Value_type_of_a_plain_value_is_its_own_type()
        => Assert.Equal("List<String>", TypeNameFormatter.FormatValueType(new List<string>()));

    // Umbraco's ObjectCacheAppCache wraps EVERY runtime-cache value in Lazy<object>, so without
    // this the Type column reads "Lazy<Object>" for every entry in the store the user cares about.
    [Fact]
    public void Created_lazy_reports_the_inner_value_type()
    {
        var lazy = new Lazy<object>(() => new List<string> { "a" });
        _ = lazy.Value;

        Assert.Equal("List<String>", TypeNameFormatter.FormatValueType(lazy));
    }

    [Fact]
    public void Created_lazy_of_a_concrete_type_reports_the_inner_value_type()
    {
        var lazy = new Lazy<string>(() => "hello");
        _ = lazy.Value;

        Assert.Equal("String", TypeNameFormatter.FormatValueType(lazy));
    }

    // Naming a type must never execute the user's factory: this is a read-only inspection.
    [Fact]
    public void Uncreated_lazy_is_not_forced_and_falls_back_to_the_wrapper_type()
    {
        var ran = false;
        var lazy = new Lazy<object>(() =>
        {
            ran = true;
            return new List<string>();
        });

        var name = TypeNameFormatter.FormatValueType(lazy);

        Assert.False(ran);
        Assert.False(lazy.IsValueCreated);
        Assert.Equal("Lazy<Object>", name);
    }

    [Fact]
    public void Faulted_lazy_falls_back_to_the_wrapper_type_without_rethrowing()
    {
        var lazy = new Lazy<object>(() => throw new InvalidOperationException("boom"));
        Assert.Throws<InvalidOperationException>(() => lazy.Value);

        Assert.Equal("Lazy<Object>", TypeNameFormatter.FormatValueType(lazy));
    }

    [Fact]
    public void Created_lazy_holding_null_falls_back_to_the_wrapper_type()
    {
        var lazy = new Lazy<object?>(() => null);
        _ = lazy.Value;

        Assert.Equal("Lazy<Object>", TypeNameFormatter.FormatValueType(lazy));
    }
}
