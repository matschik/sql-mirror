import { TopologicalSort } from "topological-sort";
import sql from "./sql.js";

export default function generateSqlFileContent(sqlFileConfig) {
  const { extensions, functions, tables } = sqlFileConfig;

  const sortedTables = sortTablesByReferences(tables);

  const onCreateTableToExecute = [];
  for (const sqlFunction of functions) {
    if (sqlFunction.onCreateTable) {
      onCreateTableToExecute.push(sqlFunction.onCreateTable);
    }
  }

  function generateSqlUpFileContent() {
    let sqlUpFile = "";

    for (const extension of extensions) {
      sqlUpFile += extension.up + "\n";
    }

    sqlUpFile += "\n";

    for (const sqlFunction of functions) {
      sqlUpFile += sqlFunction.up + "\n";
    }

    sqlUpFile += "\n";

    for (const table of sortedTables.reverse()) {
      const { name, columns, types, references } = table;

      const allColumns = [];

      for (const reference of references || []) {
        allColumns.push(
          sql.column.ref(reference.columnName, reference.tableNameRef, {
            nullable: reference.nullable,
          })
        );
      }

      allColumns.push(...(columns || []));

      for (const sqlType of types || []) {
        sqlUpFile += sqlType.up + "\n";
      }

      const sqlTable = sql.table(name, allColumns);

      sqlUpFile += sqlTable.up + "\n";

      for (const onCreateTable of onCreateTableToExecute) {
        const onCreateTableStr = onCreateTable(name);
        sqlUpFile += onCreateTableStr.up + "\n";
      }

      sqlUpFile += "\n\n";
    }

    return sqlUpFile;
  }

  function generateSqlDownFileContent() {
    let sqlDownFile = "";

    for (const table of sortedTables) {
      const { name, types } = table;

      for (const onCreateTable of onCreateTableToExecute) {
        const onCreateTableStr = onCreateTable(name);
        sqlDownFile += onCreateTableStr.down + "\n";
      }

      const sqlTable = sql.table(name, []);
      sqlDownFile += sqlTable.down + "\n";

      for (const sqlType of types || []) {
        sqlDownFile += sqlType.down + "\n";
      }

      sqlDownFile += "\n";
    }

    for (const sqlFunction of functions) {
      sqlDownFile += sqlFunction.down + "\n";
    }
    sqlDownFile += "\n";

    for (const extension of extensions) {
      sqlDownFile += extension.down + "\n";
    }
    sqlDownFile += "\n";

    return sqlDownFile;
  }

  const generatorComment = `-- This file was generated via sql-mirror at ${new Date().toISOString()}\n`;

  return {
    up: generatorComment + generateSqlUpFileContent(),
    down: generatorComment + generateSqlDownFileContent(),
  };
}

function sortTablesByReferences(tables) {
  const topologicalSort = new TopologicalSort(
    new Map(tables.map((table) => [table.name, table]))
  );

  for (const table of tables) {
    for (const reference of table.references || []) {
      topologicalSort.addEdge(table.name, reference.tableNameRef);
    }
  }

  const sorted = topologicalSort.sort();
  const sortedKeys = [...sorted.keys()];

  return sortedKeys.map((key) => sorted.get(key).node);
}
