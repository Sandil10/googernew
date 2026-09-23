require("dotenv").config();

const { Client } = require("pg");

const MEDIA_PATTERN = /(https?:\/\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|webm)|https?:\/\/[^"'\\\s]*s3[^"'\\\s]+|\/uploads\/[^"'\\\s]+)/gi;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const cols = await client.query(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('text','character varying','json','jsonb')
    order by table_name, column_name
  `);

  const refs = new Map();
  for (const c of cols.rows) {
    const rows = await client.query(`
      select "${c.column_name}"::text as value
      from "${c.table_schema}"."${c.table_name}"
      where "${c.column_name}"::text ~* '(s3|/uploads/|https?://)'
    `);
    for (const row of rows.rows) {
      for (const match of String(row.value || "").matchAll(MEDIA_PATTERN)) {
        const url = match[0].replace(/[,\]}]+$/, "");
        if (!refs.has(url)) refs.set(url, new Set());
        refs.get(url).add(`${c.table_name}.${c.column_name}`);
      }
    }
  }
  await client.end();

  for (const [url, fields] of refs.entries()) {
    const fullUrl = url.startsWith("/uploads/") ? `https://googer.site${url}` : url;
    try {
      const response = await fetch(fullUrl, { method: "HEAD" });
      const type = response.headers.get("content-type") || "";
      if (response.status !== 200 || type.includes("application/octet-stream") || type.includes("text/html")) {
        console.log(JSON.stringify({ status: response.status, type, url: fullUrl, fields: [...fields] }));
      }
    } catch (error) {
      console.log(JSON.stringify({ status: 0, type: "ERROR", url: fullUrl, error: error.message, fields: [...fields] }));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
