import * as SQLite from "expo-sqlite";
import {ResultSet} from "expo-sqlite";

export interface TypedResultSet<T extends { [column: string]: any }> extends ResultSet {
    rows: Array<T>;
}

export type ConnectionCallback<T> = (connection: Connection) => Promise<T>;

export interface DatabaseOptions {
    databaseName: string;
    logging: {
        statements: boolean;
        parameters: boolean;
        results: boolean;
        timing: boolean;
    },
    onPrepareConnection: ConnectionCallback<void>,
    onMigrate: ConnectionCallback<void>,
}

export class Connection {
    private db: SQLite.WebSQLDatabase;
    private transacting = false;

    constructor(private databaseOptions: DatabaseOptions) {
        this.db = SQLite.openDatabase(this.databaseOptions.databaseName);
    }

    private logResult(elapsedMs: string, r: any) {
        if (this.databaseOptions.logging.results) {
            console.debug(`[db] Results in ${elapsedMs}ms:`, r);
        }
        if (this.databaseOptions.logging.timing && !this.databaseOptions.logging.results) {
            console.debug(`[db] Results in ${elapsedMs}ms`);
        }
    }

    public execute<T extends { [column: string]: any }>(sqlStatement: string, args: unknown[] = []): Promise<TypedResultSet<T>> {
        return new Promise<TypedResultSet<T>>((resolve, reject) => {
            if (this.databaseOptions.logging.statements) {
                console.debug("[db] SQL:", sqlStatement);
            }
            if (this.databaseOptions.logging.parameters) {
                console.debug('[db] Parameters:', args);
            }

            const startMs = Date.now();

            this.db.exec([{sql: sqlStatement, args}], false, (err, res) => {
                const elapsedMs = (Date.now() - startMs).toFixed(0);

                if (err) {
                    this.logResult(elapsedMs, err);
                    return reject(err);
                }

                if (!res) {
                    this.logResult(elapsedMs, res);
                    return reject(new Error(`Result is ${res}`));
                }

                if ('error' in res[0]) {
                    this.logResult(elapsedMs, res[0].error);
                    return reject(res[0].error);
                }

                this.logResult(elapsedMs, res[0]);
                resolve(res[0] as TypedResultSet<T>);
            });
        });
    }

    close() {
        this.db.closeAsync();
    }

    public async beginTransaction() {
        console.assert(!this.transacting);

        await this.execute("begin transaction");
        this.transacting = true;
    }

    public async commitTransaction() {
        console.assert(this.transacting);

        await this.execute("commit");
        this.transacting = false;
    }

    public async rollbackTransaction() {
        console.assert(this.transacting);

        await this.execute("rollback");
        this.transacting = false;
    }
}

export class Database {
    public readonly defaultConnection: Connection;
    private readonly prepareDefaultConnection: Promise<void>;
    private readonly migrate: Promise<void>;

    constructor(private databaseOptions: DatabaseOptions) {
        this.defaultConnection = this.createConnection();

        this.prepareDefaultConnection = this.databaseOptions.onPrepareConnection(this.defaultConnection);
        this.migrate = this.connection(this.databaseOptions.onMigrate, false);
    }

    private createConnection() {
        return new Connection(this.databaseOptions);
    }

    async connection<T>(cb: ConnectionCallback<T>, ensureMigrated = true): Promise<T> {
        if (ensureMigrated) {
            await this.migrate;
        }

        const connection = this.createConnection();
        await this.databaseOptions.onPrepareConnection(connection);

        try {
            return await cb(connection);
        } finally {
            connection.close();
        }
    }

    async transactionPreflight() {
        await this.prepareDefaultConnection;
        await this.migrate;
    }

    async execute(sqlQuery: string, args: unknown[] = []) {
        await this.transactionPreflight();

        return await this.defaultConnection.execute(sqlQuery, args);
    }

    async transaction<T>(cb: ConnectionCallback<T>): Promise<T> {
        await this.transactionPreflight();

        return await this.connection(async conn => {
            await conn.beginTransaction();
            try {
                const r = await cb(conn);
                await conn.commitTransaction();

                return r;
            } catch (e) {
                await conn.rollbackTransaction();
                throw e;
            }
        });
    }

    close() {
        this.defaultConnection.close();
    }
}
