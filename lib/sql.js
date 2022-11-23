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

sql.table = function (tableName, columns) {
  const columnsStr = columns.reduce((str, column) => {
    const [columnName, ...valueArr] = column.split(" ");
    const columnValue = valueArr.join(" ");
    return `${str},\n"${columnName}" ${columnValue}`;
  }, "");

  return {
    up: formatCreateTableStr(sql`
        CREATE TABLE "${tableName}" (
            "${tableName}_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY${columnsStr},
            "created_at" TIMESTAMP DEFAULT (now()),
            "updated_at" TIMESTAMP
        );
    `),
    down: sql`DROP TABLE IF EXISTS "${tableName}";`,
  };
};

sql.extension = {
  uuid: {
    up: sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
    down: sql`DROP EXTENSION IF EXISTS "uuid-ossp";`,
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
    onCreateTable(tableName) {
      return {
        up: sql`
        CREATE TRIGGER updated_at_on_${tableName} BEFORE UPDATE ON "${tableName}"
        FOR EACH ROW
        EXECUTE PROCEDURE updated_at_column();
       `,
        down: sql`DROP TRIGGER IF EXISTS "updated_at_on_${tableName}" ON "${tableName}";`,
      };
    },
  },
};

sql.type = function (name, value) {
  return {
    up: sql`CREATE TYPE "${name}" AS ${value};`,
    down: sql`DROP TYPE IF EXISTS "${name}";`,
  };
};

sql.column = {
  email(columnName = "email") {
    return sql`${columnName} VARCHAR(255) UNIQUE NOT NULL`;
  },
  ref(columnName, tableName, { nullable = false, onDelete = "CASCADE" } = {}) {
    return sql`${columnName} uuid${
      nullable ? "" : " NOT NULL"
    } REFERENCES "${tableName}"(${tableName}_id)`;
  },
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
