# 🪞 sql-mirror

> Opiniated consistent SQL migrations using reusable raw SQL chunks

## ✅ Requirements

- NodeJS

## ⚙️ Features

- Reusable raw SQL chunks
- Generate up/down raw SQL migrations
- Consistent table id naming & uuid_v4 value
- Systematic created_at/updated_at columns
- SQL chunks are automatically correctly sorted via topological order

## ✨ Usage

```sh
pnpm add -D sql-mirror
```

```js
import { sql, generateSqlFileContent } from "sql-mirror";
import fs from "fs";

const sqlMirrorConfig = {
  extensions: [sql.extension.uuid],
  functions: [sql.function.updated_at_column],
  tables: [
    {
      name: "user",
      columns: [
        sql.column.email("email"),
        "password_hash VARCHAR(255) NOT NULL",
        "password_reset_token VARCHAR(255)",
        "password_reset_token_generated_at TIMESTAMP",
        "email_confirmation_sent_at TIMESTAMP",
        "email_confirmed_at TIMESTAMP",
      ],
    },
    {
      name: "user_permission",
      columns: ["name VARCHAR(255) NOT NULL", "description TEXT"],
    },
    {
      name: "user_role",
      columns: ["name VARCHAR(255) NOT NULL", "description TEXT"],
    },
    {
      name: "user_role_permission",
      references: [
        {
          columnName: "user_role_id",
          tableNameRef: "user_role",
        },
        {
          columnName: "user_permission_id",
          tableNameRef: "user_permission",
        },
      ],
    },
    {
      name: "reward",
      columns: [
        "title VARCHAR NOT NULL",
        "img_url VARCHAR",
        "description TEXT NOT NULL",
        "points_price INT NOT NULL",
      ],
    },
    {
      name: "reward_user",
      references: [
        {
          columnName: "user_id",
          tableNameRef: "user",
        },
        {
          columnName: "reward_id",
          tableNameRef: "reward",
        },
      ],
    },
  ],
};

const newSqlFile = generateSqlFileContent(sqlMirrorConfig);

const dirPath = `./migrations/${new Date().toISOString()}`;

fs.mkdirSync(dirPath, { recursive: true });
fs.writeFileSync(`${dirPath}/up.sql`, newSqlFile.up);
fs.writeFileSync(`${dirPath}/down.sql`, newSqlFile.down);
fs.writeFileSync(
  `${dirPath}/sql-mirror-config.json`,
  JSON.stringify(sqlMirrorConfig, null, 2)
);
```

## 🤔 Why ?

If you attempt to write raw SQL to make migrations, you will encounter these problems:

- order carefully because of dependent table relations
- rewrite same function/triggers usage
- repeat writing created_at/updated_at table columns
- writing consistent foreign keys is painful
- ...

I wrote sql-mirror to be as close to raw SQL but with reusable raw SQL chunks

## ⚖️ License

MIT. Made with 💖
