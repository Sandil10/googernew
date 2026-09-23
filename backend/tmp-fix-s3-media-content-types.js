require("dotenv").config();

const { Client } = require("pg");
const { S3Client, HeadObjectCommand, CopyObjectCommand } = require("@aws-sdk/client-s3");

const S3_URL_PATTERN = /https?:\/\/([^."'\\/\s]+\.s3[^\s"'\\/]*)\/([^"'\\\s]+)/gi;

const contentTypeForKey = (key) => {
  const cleanKey = String(key || "").split("?")[0].toLowerCase();
  if (/\.(jpg|jpeg|jfif|jpe|pjpeg|pjp)$/.test(cleanKey)) return "image/jpeg";
  if (cleanKey.endsWith(".png")) return "image/png";
  if (cleanKey.endsWith(".webp")) return "image/webp";
  if (cleanKey.endsWith(".gif")) return "image/gif";
  if (cleanKey.endsWith(".mp4")) return "video/mp4";
  if (cleanKey.endsWith(".webm")) return "video/webm";
  if (cleanKey.endsWith(".mov")) return "video/quicktime";
  return "";
};

async function main() {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-1";
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const s3 = new S3Client({ region });

  await client.connect();
  const cols = await client.query(`
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and data_type in ('text','character varying','json','jsonb')
  `);

  const keys = new Set();
  for (const c of cols.rows) {
    const rows = await client.query(`
      select "${c.column_name}"::text as value
      from "${c.table_schema}"."${c.table_name}"
      where "${c.column_name}"::text like $1
    `, [`%${bucket}%`]);
    for (const row of rows.rows) {
      for (const match of String(row.value || "").matchAll(S3_URL_PATTERN)) {
        const key = decodeURIComponent(match[2].replace(/[,\]}]+$/, ""));
        if (contentTypeForKey(key)) keys.add(key);
      }
    }
  }
  await client.end();

  let checked = 0;
  let updated = 0;
  for (const key of keys) {
    checked += 1;
    const expected = contentTypeForKey(key);
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.ContentType === expected) continue;

    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
      MetadataDirective: "REPLACE",
      ContentType: expected,
      CacheControl: head.CacheControl,
      Metadata: head.Metadata,
    }));
    updated += 1;
    console.log(`${key}: ${head.ContentType || "(none)"} -> ${expected}`);
  }

  console.log(JSON.stringify({ checked, updated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
