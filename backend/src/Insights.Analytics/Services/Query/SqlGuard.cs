using System.Text;
using System.Text.RegularExpressions;

namespace Insights.Analytics.Services.Query;

/// Refuses SQL that isn't a single read-only SELECT over the knowledge model's tables, before it reaches the database.
/// PostgreSQL's read-only transaction already refuses writes; this check also keeps out what a read-only transaction
/// allows: other tables and system catalogs, file and server functions (pg_read_file, dblink, lo_*), functions that
/// run SQL passed as a string (query_to_xml), settings, and several statements in one. SQL Server has no read-only
/// transaction, so there it also keeps out EXEC, OPENROWSET and the like, sys.* and xp_* / sp_* procedures.
/// The text is checked after removing comments and string literals, so -- comments or the words inside a value
/// can't hide anything or cause false alarms. Quoting follows the dialect: $$ and E'\'' strings exist only in
/// PostgreSQL, [bracketed names] only in SQL Server.
public static partial class SqlGuard
{
    /// Why the query is refused, or null when it may run. Tables are the knowledge model's, schema-qualified (public.t).
    public static string? RejectionReason(string sql, IReadOnlyCollection<string> tables, SqlDialect dialect = SqlDialect.PostgreSQL)
    {
        // Keywords are checked with quoted names blanked ("update" as a column alias is fine); names are checked
        // with simple quoted names unquoted ("pg_catalog"."pg_user" is still pg_catalog.pg_user).
        if (CodeOnly(sql, unquoteNames: false, dialect) is not { } keywords || CodeOnly(sql, unquoteNames: true, dialect) is not { } names)
            return "The query has an unclosed comment, string or quoted name.";

        var sqlServer = dialect == SqlDialect.SqlServer;
        keywords = keywords.Trim().TrimEnd(';').TrimEnd();
        if (keywords.Contains(';'))
            return "Only one statement can run at a time.";
        if (!SelectStart().IsMatch(keywords))
            return "Only SELECT queries (optionally starting with WITH) can run.";
        var word = Forbidden().Match(keywords);
        if (!word.Success && sqlServer)
            word = ServerForbidden().Match(keywords);
        if (word.Success)
            return $"{word.Value.ToUpperInvariant()} is not allowed: questions can only read data.";
        if ((sqlServer ? ServerSystemName() : SystemName()).Match(names) is { Success: true } system)
            return $"{system.Value.TrimEnd('.', ' ')} is not allowed: questions can only read the knowledge model's tables, not system catalogs or functions.";
        if ((sqlServer ? ServerForbiddenFunction() : ForbiddenFunction()).Match(names) is { Success: true } function)
            return $"{function.Groups[1].Value}() is not allowed: it can reach files, other servers or settings, or run other SQL.";
        foreach (var table in ReadTables(names))
        {
            if (!IsName(table))
                return "Only the knowledge model's tables can follow FROM or JOIN.";
            if (!Allowed(table, tables, CteNames(names), sqlServer ? "dbo" : "public"))
                return $"Table {table} is not in the knowledge model, so it can't be queried. Use only: {string.Join(", ", tables)}.";
        }
        return null;
    }

    static bool Allowed(string name, IReadOnlyCollection<string> tables, HashSet<string> ctes, string defaultSchema)
    {
        if (!name.Contains('.') && ctes.Contains(name))
            return true;
        // A bare name means the default schema (public on PostgreSQL's default search_path, dbo on SQL Server).
        var qualified = name.Contains('.') ? name : $"{defaultSchema}.{name}";
        return tables.Any(t => string.Equals(t.Contains('.') ? t : $"{defaultSchema}.{t}", qualified, StringComparison.OrdinalIgnoreCase));
    }

    /// Names defined by WITH name AS (...), so FROM name reads the CTE, not a table.
    static HashSet<string> CteNames(string code) =>
        CteName().Matches(code).Select(m => m.Groups[1].Value).ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// Every name read as a table after FROM or JOIN, including comma-separated lists. A name followed by "(" is a
    /// function such as generate_series and isn't a table; FROM inside extract(), substring() and trim() and
    /// IS DISTINCT FROM aren't table lists.
    static IEnumerable<string> ReadTables(string code)
    {
        var tokens = Token().Matches(code).Select(m => Regex.Replace(m.Value, @"\s+", "")).ToList();
        // The word before each open parenthesis, so FROM inside extract(... FROM ...) can be told apart.
        var callers = new Stack<string>();
        for (var i = 0; i < tokens.Count; i++)
        {
            var token = tokens[i];
            if (token == "(")
            {
                callers.Push(i > 0 ? tokens[i - 1].ToLowerInvariant() : "");
                continue;
            }
            if (token == ")")
            {
                callers.TryPop(out _);
                continue;
            }
            var isFrom = Is(token, "FROM");
            if (!isFrom && !Is(token, "JOIN"))
                continue;
            if (isFrom && (callers.TryPeek(out var caller) && caller is "extract" or "substring" or "trim" or "overlay"
                           || i > 0 && Is(tokens[i - 1], "DISTINCT")))
                continue;

            var j = i + 1;
            while (true)
            {
                while (j < tokens.Count && (Is(tokens[j], "LATERAL") || Is(tokens[j], "ONLY")))
                    j++;
                if (j >= tokens.Count)
                    break;
                if (tokens[j] == "(")
                {
                    // A subquery or VALUES list: its own FROMs are checked when the outer loop reaches them. A
                    // parenthesized join, FROM (a JOIN b), starts with a table no FROM or JOIN precedes: check it here.
                    var first = j + 1;
                    while (first < tokens.Count && tokens[first] == "(")
                        first++;
                    if (first < tokens.Count && IsName(tokens[first]) && !SubqueryStart().IsMatch(tokens[first])
                        && !(first + 1 < tokens.Count && tokens[first + 1] == "("))
                        yield return tokens[first];
                    j = SkipParentheses(tokens, j);
                }
                else if (IsName(tokens[j]))
                {
                    if (j + 1 < tokens.Count && tokens[j + 1] == "(")
                        j = SkipParentheses(tokens, j + 1);
                    else
                        yield return tokens[j++];
                }
                else
                {
                    // Anything else (#temp, ::fn(), @variable) isn't one of the knowledge model's tables.
                    yield return tokens[j];
                    break;
                }
                // Optional alias: AS name, or a name that isn't the next clause's keyword; then optional column aliases.
                if (j < tokens.Count && Is(tokens[j], "AS"))
                    j += 2;
                else if (j < tokens.Count && IsName(tokens[j]) && !ClauseWord().IsMatch(tokens[j]))
                    j++;
                if (j < tokens.Count && tokens[j] == "(")
                    j = SkipParentheses(tokens, j);
                // FROM a, b lists more tables; JOIN takes one.
                if (isFrom && j < tokens.Count && tokens[j] == ",")
                    j++;
                else
                    break;
            }
        }
    }

    /// The index after the parenthesis that closes the one at `open`.
    static int SkipParentheses(List<string> tokens, int open)
    {
        var depth = 0;
        for (var i = open; i < tokens.Count; i++)
        {
            if (tokens[i] == "(")
                depth++;
            else if (tokens[i] == ")" && --depth == 0)
                return i + 1;
        }
        return tokens.Count;
    }

    static bool Is(string token, string keyword) => string.Equals(token, keyword, StringComparison.OrdinalIgnoreCase);

    static bool IsName(string token) => token.Length > 0 && (char.IsLetter(token[0]) || token[0] == '_');

    /// The SQL with comments and string literals replaced by a space. Quoted names ("x", and [x] on SQL Server) become
    /// their name when unquoteNames is set and the name is a simple identifier, and a placeholder otherwise. Null when
    /// a comment, string or quoted name never ends.
    static string? CodeOnly(string sql, bool unquoteNames, SqlDialect dialect)
    {
        var postgres = dialect == SqlDialect.PostgreSQL;
        var code = new StringBuilder(sql.Length);
        var i = 0;
        while (i < sql.Length)
        {
            var c = sql[i];
            var next = i + 1 < sql.Length ? sql[i + 1] : '\0';
            if (c == '-' && next == '-')
            {
                i = sql.IndexOf('\n', i) is var end and >= 0 ? end : sql.Length;
                code.Append(' ');
            }
            else if (c == '/' && next == '*')
            {
                // Block comments nest, in PostgreSQL and SQL Server alike.
                var depth = 1;
                i += 2;
                while (i < sql.Length && depth > 0)
                {
                    if (sql[i] == '/' && i + 1 < sql.Length && sql[i + 1] == '*') { depth++; i += 2; }
                    else if (sql[i] == '*' && i + 1 < sql.Length && sql[i + 1] == '/') { depth--; i += 2; }
                    else i++;
                }
                if (depth > 0)
                    return null;
                code.Append(' ');
            }
            else if (c == '\'')
            {
                // A backslash escapes the next character only in PostgreSQL's E'...' strings; elsewhere it's an ordinary character.
                var escapes = postgres && i > 0 && sql[i - 1] is 'E' or 'e' && (i < 2 || !IsNameChar(sql[i - 2]));
                i++;
                while (true)
                {
                    if (i >= sql.Length)
                        return null;
                    if (escapes && sql[i] == '\\')
                        i += 2;
                    else if (sql[i] == '\'' && i + 1 < sql.Length && sql[i + 1] == '\'')
                        i += 2;
                    else if (sql[i] == '\'')
                        break;
                    else
                        i++;
                }
                i++;
                code.Append(' ');
            }
            else if (postgres && c == '$' && (i == 0 || !IsNameChar(sql[i - 1])) && DollarTag().Match(sql, i) is { Success: true } tag && tag.Index == i)
            {
                // PostgreSQL's $$...$$ or $tag$...$tag$ quoting.
                var end = sql.IndexOf(tag.Value, i + tag.Length, StringComparison.Ordinal);
                if (end < 0)
                    return null;
                i = end + tag.Length;
                code.Append(' ');
            }
            else if (c == '"' || c == '[' && !postgres)
            {
                // "name", or [name] on SQL Server; the closing character is doubled inside the name.
                var close = c == '[' ? ']' : '"';
                var name = new StringBuilder();
                i++;
                while (true)
                {
                    if (i >= sql.Length)
                        return null;
                    if (sql[i] == close && i + 1 < sql.Length && sql[i + 1] == close)
                    {
                        name.Append(close);
                        i += 2;
                    }
                    else if (sql[i] == close)
                    {
                        break;
                    }
                    else
                    {
                        name.Append(sql[i++]);
                    }
                }
                i++;
                code.Append(unquoteNames && SimpleName().IsMatch(name.ToString()) ? name.ToString() : " quoted_name ");
            }
            else
            {
                code.Append(c);
                i++;
            }
        }
        return code.ToString();
    }

    static bool IsNameChar(char c) => char.IsLetterOrDigit(c) || c is '_' or '$';

    [GeneratedRegex(@"^\(*\s*(SELECT|WITH)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SelectStart();

    // Statements and clauses that change data, schema, settings or transactions, or lock rows (FOR UPDATE / FOR SHARE).
    // SELECT ... INTO creates a table. TABLE x reads a whole table without a FROM, so it would skip the table check.
    [GeneratedRegex(@"\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|PREPARE|DEALLOCATE|" +
                    @"LISTEN|NOTIFY|UNLISTEN|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|SET|RESET|SHOW|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|" +
                    @"RELEASE|DISCARD|LOAD|IMPORT|SECURITY|COMMENT|INTO|SHARE|EXPLAIN|TABLE)\b", RegexOptions.IgnoreCase)]
    private static partial Regex Forbidden();

    // System catalogs and pg_* functions such as pg_read_file, pg_ls_dir, pg_sleep and pg_terminate_backend.
    [GeneratedRegex(@"\b(pg_\w*|information_schema)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SystemName();

    // Large objects (files), other servers, SQL run from a string (query_to_xml, ts_stat, ts_rewrite), settings, sequences
    // (which write even in a read-only query).
    [GeneratedRegex(@"\b(lo_\w+|dblink\w*|\w+_to_xml\w*|\w+_to_json_\w*|ts_stat|ts_rewrite|set_config|current_setting|nextval|setval|currval|lastval|txid_\w+|xmlparse)\s*\(",
        RegexOptions.IgnoreCase)]
    private static partial Regex ForbiddenFunction();

    // SQL Server, besides the above: running other SQL or procedures, waiting, server and database commands, variables.
    [GeneratedRegex(@"\b(EXEC|WAITFOR|DBCC|KILL|SHUTDOWN|RECONFIGURE|BACKUP|RESTORE|USE|DECLARE|BULK|DENY|REVERT|READTEXT|WRITETEXT|" +
                    @"UPDATETEXT|SETUSER|OPENROWSET|OPENDATASOURCE|OPENQUERY|OPENXML)\b|::", RegexOptions.IgnoreCase)]
    private static partial Regex ServerForbidden();

    // SQL Server's catalog views and system databases, and its extended and system procedures.
    [GeneratedRegex(@"\b(?:(?:sys|information_schema|master|msdb|tempdb|model|mssqlsystemresource)\s*\.|(?:xp|sp)_\w*)",
        RegexOptions.IgnoreCase)]
    private static partial Regex ServerSystemName();

    // Functions that read files, reach other servers, show server internals or run other SQL.
    [GeneratedRegex(@"\b(openrowset|opendatasource|openquery|openxml|fn_\w+|dm_\w+|has_perms_by_name|is_srvrolemember|suser_\w+|" +
                    @"object_definition|filestream\w*)\s*\(", RegexOptions.IgnoreCase)]
    private static partial Regex ServerForbiddenFunction();

    [GeneratedRegex(@"(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([A-Za-z_]\w*)\s*(?:\([^()]*\)\s*)?AS\s+(?:NOT\s+)?(?:MATERIALIZED\s+)?\(",
        RegexOptions.IgnoreCase)]
    private static partial Regex CteName();

    // A name with optional schema (public.t, spaces allowed around the dot), a parenthesis, a comma, or any other character.
    [GeneratedRegex(@"[A-Za-z_][\w$]*(?:\s*\.\s*[A-Za-z_][\w$]*)*|\(|\)|,|[^\sA-Za-z_(),]")]
    private static partial Regex Token();

    // Words that end a FROM or JOIN item rather than name its alias.
    [GeneratedRegex(@"^(WHERE|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|NATURAL|OUTER|ON|USING|GROUP|ORDER|LIMIT|OFFSET|FETCH|HAVING|WINDOW|" +
                    @"UNION|EXCEPT|INTERSECT|FOR|TABLESAMPLE|LATERAL|SELECT|WITH|WHEN|THEN|ELSE|END|AND|OR|NOT|RETURNING)$", RegexOptions.IgnoreCase)]
    private static partial Regex ClauseWord();

    // The first word of a subquery or VALUES list in parentheses, as opposed to a parenthesized join.
    [GeneratedRegex(@"^(SELECT|WITH|VALUES|TABLE)$", RegexOptions.IgnoreCase)]
    private static partial Regex SubqueryStart();

    [GeneratedRegex(@"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")]
    private static partial Regex DollarTag();

    [GeneratedRegex(@"^[A-Za-z_][A-Za-z0-9_$]*$")]
    private static partial Regex SimpleName();
}

/// Which database's SQL a query is written in, which decides how SqlGuard reads its quoting and what it refuses.
public enum SqlDialect
{
    PostgreSQL,
    SqlServer,
}
