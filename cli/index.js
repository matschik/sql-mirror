import { Command } from "commander";
import path from "node:path";
import SQLMirrorMigrator from "../lib/SQLMirrorMigrator.js";

export default async function sqlMirrorCli() {
  const { default: config } = await import(path.resolve("sqlmirror.config.js"));
  const { databaseURL, migrationsDir } = config;
  const migrator = new SQLMirrorMigrator(databaseURL, migrationsDir);

  const program = new Command();

  program.command("up").action(async () => {
    await migrator.up();
  });

  program.command("down").action(async () => {
    await migrator.down();
  });

  program
    .command("create")
    .requiredOption("-n, --name <migrationName>", "add migration name")
    .action(async ({ name }) => {
      await migrator.createNextMigrationFiles(name);
    });

  program.parseAsync();

  process.on("uncaughtException", (err) => {
    console.error(err);
  });
}
