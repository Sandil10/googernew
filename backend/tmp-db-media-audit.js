require("dotenv").config();

const { Client } = require("pg");

const MEDIA_PATTERN = /(https?:\/\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|webm)|https?:\/\/[^"'\\\s]*s3[^"'\\\s]+|\/uploads\/[^"'\\\s]+)/gi;

async function testUrl(url) {
  const fullUrl = url.startsWith("/uploads/")
    ? `https://googer.site${url}`
    : url;
  try {
    const response = await fetch(fullUrl, { method: "HEAD" });
    return {
      status: response.status,
      type: response.headers.get("content-type") || "",
      url: fullUrl,
    };
  } catch (error) {
    return { status: 0, type: "ERROR", url: fullUrl, error: error.message };
  }
}

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
    const sql = `
      select "${c.column_name}"::text as value
      from "${c.table_schema}"."${c.table_name}"
      where "${c.column_name}"::text ~* '(s3|/uploads/|https?://)'
    `;
    const rows = await client.query(sql);
    for (const row of rows.rows) {
      const matches = String(row.value || "").matchAll(MEDIA_PATTERN);
      for (const match of matches) {
        const url = match[0].replace(/[,\]}]+$/, "");
        if (!refs.has(url)) refs.set(url, []);
        refs.get(url).push(`${c.table_name}.${c.column_name}`);
      }
    }
  }

  await client.end();

  const results = [];
  for (const [url, fields] of refs.entries()) {
    const checked = await testUrl(url);
    results.push({ ...checked, fields: [...new Set(fields)].join(", ") });
  }

  const summary = results.reduce((acc, item) => {
    const key = `${item.status} ${item.type}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    totalUniqueMediaRefs: refs.size,
    summary,
    failures: results.filter((item) => item.status !== 200).slice(0, 100),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
