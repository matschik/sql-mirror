import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sqlMirror from "./sql.js";
import { createSqlTag, createPool } from "slonik";
import semver from "semver";
import { snakeCase } from "snake-case";
import { z } from "zod";
import generateSqlFileContent from "./generateSqlFileContent.js";

const sql = createSqlTag({
  typeAliases: {
    void: z.object({}).strict(),
    exists: z.object({
      exists: z.boolean(),
    }),
    sqlmirror_migration: z
      .object({
        sqlmirror_migration_id: z.number(),
        name: z.string(),
        version: z.string(),
        filename: z.string(),
        checksum: z.string(),
        created_at: z.date(),
      })
      .strict(),
  },
});

async function existsFile(filepath) {
  let exists = false;
  try {
    await fs.access(filepath);

    exists = true;
  } catch (err) {
    exists = false;
  }

  return exists;
}

const MIGRATION_TYPE_SUFFIX = [
  {
    type: "up",
    suffix: "U",
    ext: ".sql",
  },
  {
    type: "down",
    suffix: "D",
    ext: ".sql",
  },
  {
    type: "config",
    suffix: "",
    ext: ".js",
  },
];

// MigrationTableState
const MIGRATION_TABLE_STATE = {
  no_migrations_applied: "no_migrations_applied",
  table_not_created: "table_not_created",
  migration_applied: "migration_applied",
};

export default class SQLMirrorMigrator {
  #tableName = "sqlmirror_migration";
  #tableColumnId = "sqlmirror_migration_id";
  #migrationDirPath = "./migrations";
  #databaseURL;

  constructor(databaseURL, migrationDirPath) {
    this.#databaseURL = databaseURL;
    this.#migrationDirPath = migrationDirPath || this.#migrationDirPath;
  }

  async #createMigrationTable() {
    const migrationTableState = await this.#getMigrationTableStateFromDb();
    if (migrationTableState.state !== MIGRATION_TABLE_STATE.table_not_created) {
      throw new Error(
        `Migration table already exists. State: ${migrationTableState.state}`
      );
    }

    const tableConfig = {
      name: this.#tableName,
      columns: [
        "sqlmirror_migration_id SERIAL PRIMARY KEY",
        "version VARCHAR(255) UNIQUE NOT NULL",
        "name VARCHAR(255) UNIQUE NOT NULL",
        "filename VARCHAR(255) UNIQUE NOT NULL",
        "checksum TEXT NOT NULL",
      ],
      options: {
        disableId: true,
      },
      plugins: [sqlMirror.tablePlugin.created_at],
    };

    const sqlUp = generateSqlFileContent({
      tables: [tableConfig],
    }).up;

    const pool = await this.#createDbPool();
    await pool.query({ sql: sqlUp });
    await pool.end();
  }

  async #createDbPool() {
    return createPool(this.#databaseURL);
  }

  #migrationFilenameSerialize({ type, version, migrationName }) {
    const migrationType = MIGRATION_TYPE_SUFFIX.find(
      (suffix) => suffix.type === type
    );

    const migrationTypeSuffix = migrationType?.suffix;

    if (typeof migrationTypeSuffix !== "string") {
      throw new Error(`Invalid migration type: ${type}`);
    }

    if (!semver.valid(version)) {
      throw new Error(`Invalid version: ${version}`);
    }

    const fileMigrationName = snakeCase(migrationName);

    return `${version}${migrationTypeSuffix}__${fileMigrationName}${migrationType.ext}`;
  }

  #migrationFilenameParse(filepath) {
    const parsedFilename = path.parse(filepath);
    const filename = parsedFilename.base;
    const [fullVersion, migrationNameWithExt] = filename.split("__");
    const [version, suffixType] = splitAtIndex(
      fullVersion,
      fullVersion.length - 1
    );
    const migrationType = MIGRATION_TYPE_SUFFIX.find(
      (suffix) => suffix.suffix === suffixType
    )?.type;

    if (!migrationType) {
      throw new Error(`Invalid migration type suffix: ${suffixType}`);
    }

    if (!semver.valid(version)) {
      throw new Error(`Invalid version: ${version}`);
    }

    const ext = parsedFilename.ext;
    const migrationName = migrationNameWithExt.split(".")[0];
    return {
      type: migrationType,
      version,
      migrationName,
      ext,
      filename,
    };
  }

  async #getMigrationTableStateFromDb() {
    const pool = await this.#createDbPool();

    const existTableQueryResult = await pool.query(
      sql.typeAlias("exists")`SELECT EXISTS (
                    SELECT FROM
                        pg_tables
                    WHERE 
                        tablename = ${sql.literalValue([this.#tableName])}
                );
                `
    );

    if (!existTableQueryResult.rows[0].exists) {
      await pool.end();
      return {
        state: MIGRATION_TABLE_STATE.table_not_created,
      };
    }

    const lastRowQueryResult = await pool.query(
      sql.typeAlias("sqlmirror_migration")`
        SELECT *
        FROM ${sql.identifier([this.#tableName])}
        ORDER BY ${this.#tableColumnId} DESC
        LIMIT 1;
        `
    );

    if (lastRowQueryResult.rowCount === 0) {
      await pool.end();
      return {
        state: MIGRATION_TABLE_STATE.no_migrations_applied,
      };
    }

    const lastRow = lastRowQueryResult.rows[0];
    if (lastRow) {
      await pool.end();
      return {
        state: MIGRATION_TABLE_STATE.migration_applied,
        data: lastRow,
      };
    }
  }

  async #getMigrationsFromFs() {
    const migrationFiles = await fs.readdir(this.#migrationDirPath);

    return migrationFiles
      .filter((filename) => path.parse(filename).ext === ".sql")
      .map((filename) => {
        return {
          filepath: path.join(this.#migrationDirPath, filename),
          ...this.#migrationFilenameParse(filename),
        };
      });
  }

  async #getNextMigrationVersionFromFs() {
    const migrationFiles = await this.#getMigrationsFromFs();
    const lastMigration = migrationFiles[migrationFiles.length - 1];

    const version = semver.inc(lastMigration?.version || "0.0.0", "major");

    return version;
  }

  async createNextMigrationFiles(migrationName = "") {
    const version = await this.#getNextMigrationVersionFromFs();
    const upFilename = this.#migrationFilenameSerialize({
      type: "up",
      version,
      migrationName,
    });

    const downFilename = this.#migrationFilenameSerialize({
      type: "down",
      version,
      migrationName,
    });

    const configFilename = this.#migrationFilenameSerialize({
      type: "config",
      version,
      migrationName,
    });

    await fs.mkdir(this.#migrationDirPath, { recursive: true });
    await fs.writeFile(
      path.join(this.#migrationDirPath, upFilename),
      `-- up file`
    );
    await fs.writeFile(
      path.join(this.#migrationDirPath, downFilename),
      `-- down file`
    );
    await fs.writeFile(
      path.join(this.#migrationDirPath, configFilename),
      `// config file
      import { sql } from "sql-mirror";
      export default function sqlMirrorConfig() {
        return {

        }
      } 
      `
    );
  }

  async #getAppliedMigrationsFromDb() {
    const pool = await this.#createDbPool();

    const getAllResult = await pool.query(
      sql.typeAlias("void")`SELECT * FROM ${sql.identifier([
        "sqlmirror_migration",
      ])} ORDER BY ${this.#tableColumnId} DESC`
    );

    await pool.end();

    return getAllResult.rows.map((row) => {
      return this.#migrationFilenameParse(row.filename);
    });
  }

  #getMigrationConfigPath({ version, migrationName }) {
    return path.join(
      process.cwd(),
      this.#migrationDirPath,
      this.#migrationFilenameSerialize({
        type: "config",
        version,
        migrationName,
      })
    );
  }

  async up() {
    // handle migration table state
    const migrationTableState = await this.#getMigrationTableStateFromDb();
    if (migrationTableState.state === MIGRATION_TABLE_STATE.table_not_created) {
      await this.#createMigrationTable();
    }

    let lastAppliedMigration;
    if (migrationTableState.state === MIGRATION_TABLE_STATE.migration_applied) {
      lastAppliedMigration = migrationTableState.data;
    }

    const migrationsFromFs = await this.#getMigrationsFromFs();
    const migrationsUpFromFs = migrationsFromFs.filter(
      (migration) => migration.type === "up"
    );
    const appliedMigrations = await this.#getAppliedMigrationsFromDb();

    const migrationUpFilesToApply = migrationsUpFromFs
      .filter(
        (migration) =>
          !appliedMigrations.find(
            (appliedMigration) => appliedMigration.version === migration.version
          )
      )
      .filter((migration) => {
        if (!lastAppliedMigration) {
          return true;
        }

        return semver.gt(migration.version, lastAppliedMigration.version);
      });

    for (const migrationUpFile of migrationUpFilesToApply) {
      const sqlMirrorConfigFilePath =
        this.#getMigrationConfigPath(migrationUpFile);

      if (await existsFile(sqlMirrorConfigFilePath)) {
        const { default: sqlMirrorConfig } = await import(
          sqlMirrorConfigFilePath
        );
        const config = sqlMirrorConfig();

        if (Object.keys(config).length > 0) {
          const { up } = generateSqlFileContent(config);
          await fs.writeFile(migrationUpFile.filepath, up);
        }
      }

      await this.#executeUpMigration(migrationUpFile.filepath);
    }
  }

  async down() {
    const migrationTableState = await this.#getMigrationTableStateFromDb();
    if (migrationTableState.state === MIGRATION_TABLE_STATE.table_not_created) {
      throw new Error("Migration table not created");
    }

    if (
      migrationTableState.state === MIGRATION_TABLE_STATE.no_migrations_applied
    ) {
      throw new Error("No migrations applied");
    }

    if (migrationTableState.state === MIGRATION_TABLE_STATE.migration_applied) {
      const lastAppliedMigration = migrationTableState.data;

      const migrationDownFilePath = path.join(
        this.#migrationDirPath,
        this.#migrationFilenameSerialize({
          type: "down",
          version: lastAppliedMigration.version,
          migrationName: lastAppliedMigration.name,
        })
      );

      const sqlMirrorConfigFilePath = this.#getMigrationConfigPath({
        version: lastAppliedMigration.version,
        migrationName: lastAppliedMigration.name,
      });

      if (await existsFile(sqlMirrorConfigFilePath)) {
        const { default: sqlMirrorConfig } = await import(
          sqlMirrorConfigFilePath
        );
        const config = sqlMirrorConfig();

        if (Object.keys(config).length > 0) {
          const { down } = generateSqlFileContent(config);
          await fs.writeFile(migrationDownFilePath, down);
        }
      }

      await this.#executeDownMigration(migrationDownFilePath);
    }
  }

  async #executeDownMigration(filepath) {
    const fileContent = await fs.readFile(filepath, "utf8");
    const pool = await this.#createDbPool();

    const { version } = this.#migrationFilenameParse(path.basename(filepath));

    await pool.transaction(async (transactionConnection) => {
      await transactionConnection.query({ sql: fileContent });
      await transactionConnection.query(
        sql.typeAlias("void")`DELETE FROM ${sql.identifier([
          this.#tableName,
        ])} WHERE version = ${sql.literalValue([version])};`
      );
    });
    await pool.end();
  }

  async #executeUpMigration(filepath) {
    const fileContent = await fs.readFile(filepath, "utf8");
    const migration = this.#migrationFilenameParse(filepath);
    const filename = path.basename(filepath);
    const checksum = generateChecksum(fileContent);

    const pool = await this.#createDbPool();

    await pool.transaction(async (transactionConnection) => {
      await transactionConnection.query({ sql: fileContent });
      await transactionConnection.query(
        sql.typeAlias("void")`INSERT INTO ${sql.identifier([
          this.#tableName,
        ])} (version, name, filename, checksum) VALUES (
            ${sql.literalValue(migration.version)},
            ${sql.literalValue(migration.migrationName)},
            ${sql.literalValue(filename)},
            ${sql.literalValue(checksum)}
        )`
      );
    });
    await pool.end();
  }
}

function generateChecksum(str, algorithm = "md5", encoding = "hex") {
  return crypto.createHash(algorithm).update(str, "utf8").digest(encoding);
}

function splitAtIndex(str, index) {
  const result = [str.slice(0, index), str.slice(index)];

  return result;
}
