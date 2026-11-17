// Generates docs/erd.md from the LIVE local database (public schema), so the diagram cannot drift from the migrations.
// Usage: node scripts/erd.mjs           write docs/erd.md
//        node scripts/erd.mjs --stdout  print it (used by tests/integration/erd.test.ts)
// Needs the local stack running (`npm run db:start`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CONTAINER = 'supabase_db_TailorPro';
function query(sql) {
  const out = execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-At', '-F', '|', '-c', sql], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map((l) => l.split('|'));
}

const columns = query(`select table_name, column_name, data_type, is_nullable from information_schema.columns
  where table_schema = 'public' order by table_name, ordinal_position`);
const primaryKeys = new Set(query(`select tc.table_name, kcu.column_name from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'`).map(([t, c]) => `${t}.${c}`));
const foreignKeys = query(`select c.conrelid::regclass::text, a.attname, c.confrelid::regclass::text, af.attname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  order by 1, 2`).filter(([, , parent]) => !parent.includes('.')); // public-to-public only; links to auth.users are noted below
const authLinks = query(`select c.conrelid::regclass::text, a.attname from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid = 'auth.users'::regclass order by 1`);
const fkColumns = new Set(foreignKeys.map(([t, c]) => `${t}.${c}`));

const typeName = (t) => ({
  'timestamp with time zone': 'timestamptz', 'character varying': 'varchar', character: 'char', 'USER-DEFINED': 'enum',
}[t] ?? t.replace(/ /g, '_'));

const tables = [...new Set(columns.map(([t]) => t))];
let md = `# TailorPro: entity-relationship diagram

> **Generated** by \`npm run docs:erd\` from the live database. **Do not edit by hand.**
> \`tests/integration/erd.test.ts\` fails when the schema changes and this file is not regenerated.
> Shows the \`public\` schema as of the latest migration. Primary key = PK, foreign key = FK.
> Every relationship is drawn as many-to-one (child \`}o--||\` parent); uniqueness rules such as one active owner per
> workspace and one subscription per workspace are enforced in the database and described in \`DATABASE_SCHEMA.md\`.

\`\`\`mermaid
erDiagram
`;
for (const t of tables) {
  md += `  ${t} {\n`;
  for (const [tbl, col, type, nullable] of columns.filter(([x]) => x === t)) {
    const key = primaryKeys.has(`${tbl}.${col}`) ? ' PK' : fkColumns.has(`${tbl}.${col}`) ? ' FK' : '';
    md += `    ${typeName(type)} ${col}${key}${nullable === 'YES' && !key ? ' "nullable"' : ''}\n`;
  }
  md += '  }\n';
}
for (const [child, col, parent] of foreignKeys) md += `  ${child} }o--|| ${parent} : "${col}"\n`;
md += `\`\`\`

## Links to the authentication system
${authLinks.map(([t, c]) => `- \`${t}.${c}\` references \`auth.users.id\` (Supabase Auth, outside the \`public\` schema).`).join('\n')}
`;

if (process.argv.includes('--stdout')) process.stdout.write(md);
else {
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/erd.md', md);
  console.log('docs/erd.md written:', tables.length, 'tables,', foreignKeys.length, 'relationships');
}
