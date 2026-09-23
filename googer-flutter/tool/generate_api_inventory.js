const fs = require('fs');
const path = require('path');

const flutterRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(flutterRoot, '..');
const backendRoot = path.join(workspaceRoot, 'googernew-main', 'backend', 'src');
const routesRoot = path.join(backendRoot, 'routes');
const serverPath = path.join(backendRoot, 'server.js');
const outputPath = path.join(flutterRoot, 'docs', 'api-inventory.md');

function walk(root, extension) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walk(fullPath, extension));
    else if (entry.name.endsWith(extension)) result.push(fullPath);
  }
  return result;
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function normalizeEndpoint(value) {
  return value
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\$[A-Za-z_][A-Za-z0-9_.]*/g, ':param')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':param')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '') || '/';
}

function endpointShape(value) {
  return normalizeEndpoint(value)
    .split('/')
    .filter(Boolean)
    .map((segment) => segment === ':param' ? ':param' : segment)
    .join('/');
}

function mountMap() {
  const source = fs.readFileSync(serverPath, 'utf8');
  const imports = new Map();
  const importRegex = /const\s+(\w+)\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
  for (const match of source.matchAll(importRegex)) imports.set(match[1], `${match[2]}.js`);

  const mounts = new Map();
  const mountRegex = /apiRoutes\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)\s*\)/g;
  for (const match of source.matchAll(mountRegex)) {
    const routeFile = imports.get(match[2]);
    if (routeFile) mounts.set(routeFile, match[1]);
  }

  const inlineRegex = /apiRoutes\.use\(\s*['"]([^'"]+)['"]\s*,\s*require\(['"]\.\/routes\/([^'"]+)['"]\)\s*\)/g;
  for (const match of source.matchAll(inlineRegex)) mounts.set(`${match[2]}.js`, match[1]);
  return mounts;
}

function backendEndpoints() {
  const mounts = mountMap();
  const endpoints = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;

  for (const filePath of walk(routesRoot, '.js')) {
    const fileName = path.basename(filePath);
    const prefix = mounts.get(fileName);
    if (!prefix) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    const globalAuthAt = source.search(/router\.use\(\s*(?:authMiddleware|authenticateToken)\s*\)/);

    for (const match of source.matchAll(routeRegex)) {
      const start = match.index;
      const statementEnd = source.indexOf(');', start);
      const statement = source.slice(start, statementEnd < 0 ? start + 500 : statementEnd + 2);
      const routePath = match[2] === '/' ? '' : match[2];
      const endpoint = `/api${prefix}${routePath}`.replace(/\/{2,}/g, '/');
      const routeAuth = /\b(?:authMiddleware|authenticateToken)\b/.test(statement);
      const inheritedAuth = globalAuthAt >= 0 && globalAuthAt < start;
      const handlerMatch = statement.match(/([A-Za-z0-9_]+(?:Controller)?\.[A-Za-z0-9_]+)\s*\)?\s*;?\s*$/);

      endpoints.push({
        method: match[1].toUpperCase(),
        endpoint,
        auth: routeAuth || inheritedAuth ? 'Bearer' : 'Public',
        handler: handlerMatch ? handlerMatch[1] : 'inline/wrapped',
        source: `backend/src/routes/${fileName}:${lineNumber(source, start)}`,
      });
    }
  }
  return endpoints;
}

function flutterCalls() {
  const calls = [];
  const libRoot = path.join(flutterRoot, 'lib');
  const callRegex = /\b(_get|_post|_put|_patch|_delete|_deleteBody|ApiClient\.(?:get|post|put|delete))\s*\(\s*(["'`])([^"'`]+)\2/g;
  const multipartRegex = /\b_multipart\s*\(\s*(["'`])(GET|POST|PUT|PATCH|DELETE)\1\s*,\s*(["'`])([^"'`]+)\3/g;
  const methodMap = {
    _get: 'GET',
    _post: 'POST',
    _put: 'PUT',
    _patch: 'PATCH',
    _delete: 'DELETE',
    _deleteBody: 'DELETE',
    'ApiClient.get': 'GET',
    'ApiClient.post': 'POST',
    'ApiClient.put': 'PUT',
    'ApiClient.delete': 'DELETE',
  };

  for (const filePath of walk(libRoot, '.dart')) {
    const source = fs.readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(callRegex)) {
      const rawPath = match[3];
      if (!rawPath.startsWith('/')) continue;
      calls.push({
        method: methodMap[match[1]],
        endpoint: `/api${rawPath}`.replace(/\/{2,}/g, '/'),
        shape: endpointShape(`/api${rawPath}`),
        source: `${path.relative(flutterRoot, filePath).replace(/\\/g, '/')}:${lineNumber(source, match.index)}`,
      });
    }
    for (const match of source.matchAll(multipartRegex)) {
      const rawPath = match[4];
      if (!rawPath.startsWith('/')) continue;
      calls.push({
        method: match[2],
        endpoint: `/api${rawPath}`.replace(/\/{2,}/g, '/'),
        shape: endpointShape(`/api${rawPath}`),
        source: `${path.relative(flutterRoot, filePath).replace(/\\/g, '/')}:${lineNumber(source, match.index)}`,
      });
    }
  }
  return calls;
}

function findCoverage(endpoint, calls) {
  const shape = endpointShape(endpoint.endpoint);
  const matches = calls.filter((call) => {
    const methodMatches = call.method === endpoint.method;
    return methodMatches && call.shape === shape;
  });
  return matches;
}

function render() {
  const endpoints = backendEndpoints().sort((a, b) => a.endpoint.localeCompare(b.endpoint) || a.method.localeCompare(b.method));
  const calls = flutterCalls();
  let covered = 0;
  const groupCoverage = new Map();
  const rows = endpoints.map((endpoint) => {
    const matches = findCoverage(endpoint, calls);
    if (matches.length) covered += 1;
    const group = endpoint.endpoint.split('/')[2] || 'root';
    const current = groupCoverage.get(group) || { total: 0, covered: 0 };
    current.total += 1;
    if (matches.length) current.covered += 1;
    groupCoverage.set(group, current);
    const flutter = matches.length ? matches.map((item) => item.source).join('<br>') : 'MISSING';
    return `| ${endpoint.method} | \`${endpoint.endpoint}\` | ${endpoint.auth} | ${endpoint.handler} | ${flutter} | ${endpoint.source} |`;
  });

  const generatedAt = new Date().toISOString();
  const groupRows = [...groupCoverage.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, value]) => `| ${group} | ${value.total} | ${value.covered} | ${value.total - value.covered} |`)
    .join('\n');
  const content = `# Backend API Inventory and Flutter Coverage

Generated by \`node tool/generate_api_inventory.js\` at ${generatedAt}.

## Summary

| Measure | Count |
| --- | ---: |
| Backend endpoints | ${endpoints.length} |
| Flutter endpoint call sites | ${calls.length} |
| Backend endpoints with a matching Flutter call | ${covered} |
| Backend endpoints without a matching Flutter call | ${endpoints.length - covered} |

Coverage means a Flutter HTTP call with the same method and normalized path exists. It does not yet prove request fields, response fields, permissions, loading/error states, or UI parity. Those require contract and regression tests.

## Coverage by feature

| Feature prefix | Backend | Flutter matched | Missing |
| --- | ---: | ---: | ---: |
${groupRows}

## Authentication

- \`Public\`: no route-level bearer middleware was found before the handler.
- \`Bearer\`: the route uses \`authMiddleware\`/\`authenticateToken\`, directly or through \`router.use\`.
- Admin and subscription-plan authorization can also occur inside controllers; those rules must be captured in contract tests.
- P2P event streams may accept a JWT in either \`Authorization\` or the \`token\` query parameter.

## Endpoint Matrix

| Method | Endpoint | Auth | Backend handler | Flutter call site | Backend source |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
  process.stdout.write(`Wrote ${outputPath}\n${endpoints.length} endpoints, ${covered} covered, ${endpoints.length - covered} missing\n`);
}

render();
