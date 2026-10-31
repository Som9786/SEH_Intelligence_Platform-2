namespace Insights.DbCatalog.Services.Catalog;

/// The catalog export is missing, unreadable or inconsistent, e.g. a relationship to a table it doesn't describe.
/// The message names every problem found.
public sealed class CatalogException(string message) : Exception(message);

/// A request named a database the catalog folder has no export for.
public sealed class UnknownDatabaseException(string message) : Exception(message);
