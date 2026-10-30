using System.Collections;
using System.Data.Common;
using System.Globalization;
using Microsoft.Data.SqlClient;

namespace Insights.Analytics.Services.Query;

/// Converts database values to JSON-friendly ones: dates as yyyy-MM-dd and timestamps as ISO 8601 strings (which the
/// Q&A page draws as a line over time), numbers and booleans as they are, and anything else as its text.
public static class SqlValueConverter
{
    public static object? ToJsonValue(DbDataReader reader, int i)
    {
        if (reader.IsDBNull(i))
            return null;
        // SQL Server decimals go up to 38 digits, .NET's to 28: a long division result is read as a double instead.
        if (reader is SqlDataReader sql && reader.GetFieldType(i) == typeof(decimal))
        {
            var value = sql.GetSqlDecimal(i);
            try
            {
                return value.Value;
            }
            catch (OverflowException)
            {
                return value.ToDouble();
            }
        }
        // date comes back as a DateTime at midnight, so the column's type decides how it's written.
        return reader.GetDataTypeName(i) == "date" && reader.GetValue(i) is DateTime day
            ? day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : ToJsonValue(reader.GetValue(i));
    }

    static object? ToJsonValue(object? value) => value switch
    {
        null or DBNull => null,
        string or bool or byte or short or int or long or decimal => value,
        // JSON has no NaN or Infinity.
        double d => double.IsFinite(d) ? d : d.ToString(CultureInfo.InvariantCulture),
        float f => float.IsFinite(f) ? f : f.ToString(CultureInfo.InvariantCulture),
        DateTime t => t.ToString(t.Kind == DateTimeKind.Utc ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : "yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture),
        DateTimeOffset t => t.ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture),
        DateOnly d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        TimeOnly t => t.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        TimeSpan t => t.ToString("c", CultureInfo.InvariantCulture),
        // Arrays, e.g. from array_agg.
        IEnumerable list and not byte[] => list.Cast<object?>().Select(ToJsonValue).ToList(),
        _ => Convert.ToString(value, CultureInfo.InvariantCulture),
    };
}
