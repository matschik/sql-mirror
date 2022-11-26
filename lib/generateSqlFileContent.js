import { TopologicalSort } from "topological-sort";
import sql from "./sql.js";

export default function generateSqlFileContent(sqlFileConfig) {
  const { extensions = [], functions = [], tables = [] } = sqlFileConfig;

  const allExtensions = [...extensions];

  for (const table of tables) {
    for (const plugin of table.plugins || []) {
      if (plugin.extensions) {
        for (const extension of plugin.extensions) {
          if (!allExtensions.find((ext) => ext.name === extension.name)) {
            allExtensions.push(extension);
          }
        }
      }
    }
  }

  const sortedTables = sortTablesByReferences(tables);

  function getTableColumns(table) {
    const { columns = [], references = [], plugins = [] } = table;

    const tableColumns = [];

    // Add table reference columns
    for (const reference of references || []) {
      tableColumns.push(
        sql.column.ref(reference.columnName, reference.tableNameRef, {
          nullable: reference.nullable,
        })
      );
    }

    // Add table own columns
    tableColumns.push(...(columns || []));

    // Add table plugin columns
    for (const plugin of plugins) {
      if (plugin.columns) {
        tableColumns.push(...plugin.columns.map((column) => column()));
      }
    }
    return tableColumns;
  }

  function generateSqlUpFileContent() {
    let sqlUpFile = "";

    for (const extension of allExtensions) {
      sqlUpFile += extension.up + "\n";
    }

    if (extensions.length > 0) {
      sqlUpFile += "\n";
    }

    for (const sqlFunction of functions) {
      sqlUpFile += sqlFunction.up + "\n";
    }
    if (functions.length > 0) {
      sqlUpFile += "\n";
    }

    for (const table of [...sortedTables].reverse()) {
      const { name: tableName, types, plugins = [], options } = table;

      const tableColumns = getTableColumns(table);

      // Add table types
      for (const sqlType of types || []) {
        sqlUpFile += sqlType.up + "\n";
      }

      const sqlTable = sql.table(tableName, tableColumns, options);

      sqlUpFile += sqlTable.up + "\n";

      for (const plugin of plugins) {
        if (plugin.triggers) {
          for (const pluginTrigger of plugin.triggers) {
            sqlUpFile += pluginTrigger(tableName, tableColumns).up + "\n";
          }
        }
      }

      sqlUpFile += "\n\n";
    }

    return sqlUpFile;
  }

  function generateSqlDownFileContent() {
    let sqlDownFile = "";

    for (const table of sortedTables) {
      const { name: tableName, types = [], plugins = [], options } = table;

      const tableColumns = getTableColumns(table);

      for (const plugin of plugins) {
        if (plugin.triggers) {
          for (const pluginTrigger of plugin.triggers) {
            sqlDownFile += pluginTrigger(tableName, tableColumns).down + "\n";
          }
        }
      }

      const sqlTable = sql.table(tableName, [], options);
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

    for (const extension of allExtensions) {
      sqlDownFile += extension.down + "\n";
    }
    sqlDownFile += "\n";

    return sqlDownFile;
  }

  const generatorComment = `-- This file was generated via sql-mirror at ${new Date().toISOString()}\n`;

  function wrapTransaction(sqlContent) {
    return `BEGIN TRANSACTION;\n\n${sqlContent}\n\nCOMMIT TRANSACTION;`;
  }

  return {
    up: generatorComment + wrapTransaction(generateSqlUpFileContent()),
    down: generatorComment + wrapTransaction(generateSqlDownFileContent()),
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
