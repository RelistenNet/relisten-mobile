import { Connection, TypedResultSet } from './database';
import { Model } from './model';
import { getModelMetadata } from './decorators';
import { ResultSet } from './observable/result_set';
import * as R from 'remeda';

export type QueryBuilderCallback = (tableAlias: string) => string;

export interface Query {
  joins?: QueryBuilderCallback;
  where?: QueryBuilderCallback;
  order?: QueryBuilderCallback;
  parameters?: unknown[];
}

export async function upsert(
  connection: Connection,
  models: Model[]
): Promise<TypedResultSet<any>> {
  if (models.length === 0) {
    return { rowsAffected: 0, rows: [] };
  }

  const model = models[0];
  const fieldMetadata = model.allFieldMetadata();
  const columnNames = fieldMetadata.map((m) => m.field.columnName);
  const columnPlaceholders = new Array(columnNames.length).fill('?').join(',');

  const chunkSize = 100;

  const rs: TypedResultSet<any> = { rowsAffected: 0, rows: [] };

  for (const m of R.chunk(models, chunkSize)) {
    const values = new Array(m.length).fill(`(${columnPlaceholders})`).join(',\n');

    const r = await connection.execute(
      `
            INSERT INTO ${model.modelMetadata.tableName} (${columnNames.join(',')})
            VALUES ${values}
            ON CONFLICT (id) DO UPDATE SET
                ${columnNames.map((n) => `${n}=EXCLUDED.${n}`).join(', ')}
        `,
      R.flatMap(m, (model) => {
        const raw = model.toStorage();
        return columnNames.map((n) => raw[n]);
      })
    );

    rs.rowsAffected += r.rowsAffected;
    rs.rows.push(...r.rows);
  }

  return rs;
}

export async function query<T extends Model, C extends typeof Model>(
  connection: Connection,
  model: C,
  q: Query = {}
): Promise<ResultSet<T, C>> {
  const { joins, where, order, parameters } = q;
  const modelMetadata = getModelMetadata(model);
  const tableAlias = 'm';

  const results = await connection.execute(
    `
        SELECT m.*
        FROM ${modelMetadata.tableName} ${tableAlias} ${joins ? '\n' + joins(tableAlias) : ''}
        WHERE 1=1 ${where ? '\nAND (' + where(tableAlias) + ')' : ''}
        ${order ? 'ORDER BY ' + order(tableAlias) : ''}
    `.trimEnd(),
    parameters || []
  );

  const resultSet = new ResultSet<T, C>(model, q, []);

  results.rows.map((r) => {
    const m = model.createFromDatabase<T>(r, resultSet);
    resultSet.results.push(m);
    return m;
  });

  return resultSet;
}
