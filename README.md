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

### Installation
```sh
pnpm add -D sql-mirror
```

### Input
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

### Output

`migrations/2022-11-23T17:43:34.408Z/up.sql`
```sql
-- This file was generated via sql-mirror at 2022-11-23T17:43:34.406Z
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE TABLE "user" (
    "user_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_reset_token" VARCHAR(255),
    "password_reset_token_generated_at" TIMESTAMP,
    "email_confirmation_sent_at" TIMESTAMP,
    "email_confirmed_at" TIMESTAMP,
    "created_at" TIMESTAMP DEFAULT (now()),
    "updated_at" TIMESTAMP
);
CREATE TRIGGER updated_at_on_user BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE PROCEDURE updated_at_column();


CREATE TABLE "reward" (
    "reward_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY,
    "title" VARCHAR NOT NULL,
    "img_url" VARCHAR,
    "description" TEXT NOT NULL,
    "points_price" INT NOT NULL,
    "created_at" TIMESTAMP DEFAULT (now()),
    "updated_at" TIMESTAMP
);
CREATE TRIGGER updated_at_on_reward BEFORE UPDATE ON "reward"
FOR EACH ROW
EXECUTE PROCEDURE updated_at_column();


CREATE TABLE "reward_user" (
    "reward_user_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES "user"(user_id),
    "reward_id" uuid NOT NULL REFERENCES "reward"(reward_id),
    "created_at" TIMESTAMP DEFAULT (now()),
    "updated_at" TIMESTAMP
);
CREATE TRIGGER updated_at_on_reward_user BEFORE UPDATE ON "reward_user"
FOR EACH ROW
EXECUTE PROCEDURE updated_at_column();


CREATE TABLE "user_role" (
    "user_role_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP DEFAULT (now()),
    "updated_at" TIMESTAMP
);
CREATE TRIGGER updated_at_on_user_role BEFORE UPDATE ON "user_role"
FOR EACH ROW
EXECUTE PROCEDURE updated_at_column();


CREATE TABLE "user_permission" (
    "user_permission_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP DEFAULT (now()),
    "updated_at" TIMESTAMP
);
CREATE TRIGGER updated_at_on_user_permission BEFORE UPDATE ON "user_permission"
FOR EACH ROW
EXECUTE PROCEDURE updated_at_column();


CREATE TABLE "user_role_permission" (
    "user_role_permission_id" uuid DEFAULT uuid_generate_v4 () PRIMARY KEY,
    "user_role_id" uuid NOT NULL REFERENCES "user_role"(user_role_id),
    "user_permission_id" uuid NOT NULL REFERENCES "user_permission"(user_permission_id),
    "created_at" TIMESTAMP DEFAULT (now()),
    "updated_at" TIMESTAMP
);
CREATE TRIGGER updated_at_on_user_role_permission BEFORE UPDATE ON "user_role_permission"
FOR EACH ROW
EXECUTE PROCEDURE updated_at_column();
```

`migrations/2022-11-23T17:43:34.408Z/down.sql`
```sql
-- This file was generated via sql-mirror at 2022-11-23T17:43:34.406Z
DROP TRIGGER IF EXISTS "updated_at_on_user" ON "user";
DROP TABLE IF EXISTS "user";

DROP TRIGGER IF EXISTS "updated_at_on_reward" ON "reward";
DROP TABLE IF EXISTS "reward";

DROP TRIGGER IF EXISTS "updated_at_on_reward_user" ON "reward_user";
DROP TABLE IF EXISTS "reward_user";

DROP TRIGGER IF EXISTS "updated_at_on_user_role" ON "user_role";
DROP TABLE IF EXISTS "user_role";

DROP TRIGGER IF EXISTS "updated_at_on_user_permission" ON "user_permission";
DROP TABLE IF EXISTS "user_permission";

DROP TRIGGER IF EXISTS "updated_at_on_user_role_permission" ON "user_role_permission";
DROP TABLE IF EXISTS "user_role_permission";

DROP FUNCTION updated_at_column();

DROP EXTENSION IF EXISTS "uuid-ossp";
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
