import { config } from "dotenv";
import postgres from "postgres";
config({ path: ".env.local" });
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await client.begin(async (tx) => {
      await tx`CREATE TABLE IF NOT EXISTS docs (
        id serial PRIMARY KEY,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title text NOT NULL,
        content text NOT NULL DEFAULT '',
        created_by_id integer REFERENCES users(id) ON DELETE SET NULL,
        updated_by_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await tx`CREATE INDEX IF NOT EXISTS docs_project_idx ON docs (project_id)`;
      await tx`CREATE TABLE IF NOT EXISTS doc_versions (
        id serial PRIMARY KEY,
        doc_id integer NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
        title text NOT NULL,
        content text NOT NULL,
        editor_id integer REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await tx`CREATE INDEX IF NOT EXISTS doc_versions_doc_idx ON doc_versions (doc_id)`;
    });
    console.log("云文档数据表已就绪");
  } finally { await client.end(); }
}
main().catch(() => { console.error("云文档数据表更新失败，请检查数据库连接"); process.exitCode = 1; });
