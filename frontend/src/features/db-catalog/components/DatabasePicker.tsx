import { useEffect } from 'react';
import { Database } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  DATABASE_PARAM,
  pickCatalogDatabase,
  setCatalogDatabase,
} from '../../../platform/files/catalogDatabase';
import { useCatalogDatabases } from '../../../shared/hooks/useCatalogDatabases';

/**
 * Switches the database the DB Catalog pages show. The address says which one (?db=), so a link or
 * bookmark opens that database and Back returns to the previous one. A page opened without it
 * gets the selected database added. Hidden until DB Catalog lists its databases.
 */
export function DatabasePicker() {
  const { data, selected } = useCatalogDatabases();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromUrl = params.get(DATABASE_PARAM);

  useEffect(() => {
    const setInUrl = (name: string) =>
      setParams(
        (current) => {
          current.set(DATABASE_PARAM, name);
          return current;
        },
        { replace: true },
      );
    // A database DB Catalog doesn't have (an old link): show the default one instead.
    if (fromUrl && data && !data.some((d) => d.name === fromUrl)) {
      const fallback = pickCatalogDatabase(data, selected);
      if (fallback) setInUrl(fallback);
    } else if (fromUrl) setCatalogDatabase(fromUrl);
    else if (selected) setInUrl(selected);
  }, [fromUrl, data, selected, setParams]);

  if (!data?.length) return null;

  // A table or document in the address belongs to the database that was showing, so it's dropped.
  const onChange = (name: string) =>
    void navigate({
      pathname: location.pathname,
      search: `?${DATABASE_PARAM}=${encodeURIComponent(name)}`,
    });

  return (
    <label className="database-picker" title="The database DB Catalog shows">
      <Database size={16} aria-hidden="true" />
      <select
        aria-label="Database"
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {data.map((d) => (
          <option key={d.name} value={d.name}>
            {d.title}
            {d.lastLoad?.succeeded === false ? ' (failed to load)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
