import { stripIndents } from "common-tags";

export default function sql(staticStrArr, ...dynamicValues) {
  let str = "";
  for (let i = 0; i < staticStrArr.length; i++) {
    str += staticStrArr[i];
    if (i < dynamicValues.length) {
      str += dynamicValues[i];
    }
  }
  return stripIndents(str);
}

sql.table = function (
  tableName,
  columns = [],
  constraints = [],
  { disableId = false } = {}
) {
  let idColumn = "";
  if (!disableId) {
    idColumn = `${tableName}_id uuid DEFAULT uuid_generate_v4 () PRIMARY KEY`;
  }

  const defaultStartColumns = [idColumn].filter((v) => v);

  const allColumns = [...defaultStartColumns, ...columns];
  const columnsFormatted = allColumns.map((column) => {
    const [columnName, ...valueArr] = column.split(" ");
    const columnValue = valueArr.join(" ");
    return `"${columnName}" ${columnValue}`;
  });

  return {
    up: formatCreateTableStr(sql`
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          ${[...columnsFormatted, ...constraints].join(",\n  ")}
        );
    `),
    down: sql`DROP TABLE IF EXISTS "${tableName}";`,
  };
};

sql.extension = {
  uuid: {
    name: "uuid-ossp",
    up: sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
    down: sql`DROP EXTENSION IF EXISTS "uuid-ossp";`,
  },
  moddatetime: {
    name: "moddatetime",
    up: sql`CREATE EXTENSION IF NOT EXISTS "moddatetime";`,
    down: sql`DROP EXTENSION IF EXISTS "moddatetime";`,
  },
};

sql.column = {
  email(columnName = "email") {
    return sql`${columnName} VARCHAR(255) UNIQUE NOT NULL`;
  },
  created_at() {
    return sql`created_at TIMESTAMP WITH TIME ZONE DEFAULT (now())`;
  },
  updated_at() {
    return sql`updated_at TIMESTAMP WITH TIME ZONE`;
  },
  ref(columnName, tableName, { nullable = false, onDelete = "CASCADE" } = {}) {
    return sql`${columnName} uuid${
      nullable ? "" : " NOT NULL"
    } REFERENCES "${tableName}"(${tableName}_id)`;
  },
};

sql.trigger = {
  updated_at_on_table(tableName) {
    return {
      up: sql`
        CREATE TRIGGER handle_updated_at BEFORE UPDATE ON "${tableName}"
        FOR EACH ROW
        EXECUTE PROCEDURE moddatetime(updated_at);
       `,
      down: sql`DROP TRIGGER IF EXISTS handle_updated_at ON "${tableName}";`,
    };
  },
};

sql.tablePlugin = {
  created_at: {
    columns: [sql.column.created_at],
  },
  updated_at: {
    extensions: [sql.extension.moddatetime],
    columns: [sql.column.updated_at],
    triggers: [sql.trigger.updated_at_on_table],
  },
};

sql.function = {
  updated_at_column: {
    up: sql`
            CREATE OR REPLACE FUNCTION updated_at_column()
            RETURNS trigger AS
            $BODY$
            BEGIN
                IF (NEW.updated_at IS NULL) THEN
                    NEW.updated_at = NOW();
                END IF;
                RETURN NEW;
            END;
            $BODY$
            LANGUAGE plpgsql VOLATILE
            COST 100;
        `,
    down: sql`DROP FUNCTION updated_at_column();`,
  },
};

sql.type = function (name, value) {
  return {
    up: sql`CREATE TYPE "${name}" AS ${value};`,
    down: sql`DROP TYPE IF EXISTS "${name}";`,
  };
};

function formatCreateTableStr(createTableStr) {
  const createTableStrArr = createTableStr.split("\n");
  const firstLine = createTableStrArr[0];
  const lastLine = createTableStrArr[createTableStrArr.length - 1];
  const middleLines = createTableStrArr.slice(1, createTableStrArr.length - 1);
  const middleLinesStr = middleLines.reduce((str, line) => {
    return `${str}\n    ${line}`;
  }, "");
  return `${firstLine}${middleLinesStr}\n${lastLine}`;
}
