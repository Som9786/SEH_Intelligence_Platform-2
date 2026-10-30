using System.Globalization;

namespace Insights.DbGuide.Workspace;

/// Checks a schedule's fields and works out when it would next run.
public static class ScheduleRules
{
    /// What's wrong with the input, or null when it's a valid schedule.
    public static string? Problem(ScheduleInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Question) || input.Question.Length > 1000)
            return "'question' is required, up to 1000 characters.";
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 120)
            return "'name' is required, up to 120 characters.";
        if (input.Frequency is null || !Frequencies.All.Contains(input.Frequency))
            return $"'frequency' must be one of {string.Join(", ", Frequencies.All)}.";
        if (!TimeOnly.TryParseExact(input.Time, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            return "'time' must be HH:mm, such as 08:00.";
        if (!DateOnly.TryParseExact(input.StartsOn, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            return "'startsOn' must be a date, yyyy-MM-dd.";
        if (input.Frequency == Frequencies.Weekly && input.DayOfWeek is not (>= 0 and <= 6))
            return "A weekly schedule needs 'dayOfWeek', 0 (Sunday) to 6 (Saturday).";
        if (input.Frequency is Frequencies.Monthly or Frequencies.Quarterly && input.DayOfMonth is not (>= 1 and <= 28))
            return "A monthly or quarterly schedule needs 'dayOfMonth', 1 to 28.";
        if (input.Board is not null && !Boards.All.Contains(input.Board))
            return $"'board' must be one of {string.Join(", ", Boards.All)}.";
        return null;
    }

    /// The next time the schedule would run after now, in the server's time zone; null when paused.
    public static DateTimeOffset? NextRun(Schedule schedule, DateTimeOffset now)
    {
        if (!schedule.Enabled)
            return null;
        var start = DateOnly.ParseExact(schedule.StartsOn, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var time = TimeOnly.ParseExact(schedule.Time, "HH:mm", CultureInfo.InvariantCulture);
        var local = now.ToLocalTime();
        var day = DateOnly.FromDateTime(local.DateTime);
        if (day < start)
            day = start;
        // A quarterly schedule repeats at most 3 months apart, so a little over a year always finds the next run.
        for (var i = 0; i < 400; i++, day = day.AddDays(1))
        {
            if (!Matches(schedule, start, day))
                continue;
            var at = new DateTimeOffset(day.ToDateTime(time), local.Offset);
            if (at > local)
                return at;
        }
        return null;
    }

    static bool Matches(Schedule schedule, DateOnly start, DateOnly day) => schedule.Frequency switch
    {
        Frequencies.Daily => true,
        Frequencies.Weekly => (int)day.DayOfWeek == schedule.DayOfWeek,
        Frequencies.Monthly => day.Day == schedule.DayOfMonth,
        Frequencies.Quarterly => day.Day == schedule.DayOfMonth && ((day.Month - start.Month) % 3 + 3) % 3 == 0,
        _ => false,
    };
}
