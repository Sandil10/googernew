#!/usr/bin/env node

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value, fallback = []) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .length > 0
        ? String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
        : fallback;
}

function percentile(sortedValues, p) {
    if (sortedValues.length === 0) return 0;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
    return sortedValues[index];
}

function expandEnvPlaceholders(value) {
    if (typeof value === 'string') {
        return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] || '');
    }

    if (Array.isArray(value)) {
        return value.map(expandEnvPlaceholders);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, expandEnvPlaceholders(nested)]));
    }

    return value;
}

function buildScenarioFromLegacyEnv(baseUrl, method, paths, headers, body) {
    return {
        name: 'legacy-env-scenario',
        baseUrl,
        requests: paths.map((requestPath) => ({
            name: requestPath,
            method,
            path: requestPath,
            weight: 1,
            headers,
            body,
        })),
    };
}

function loadScenario() {
    const baseUrl = String(process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
    const paths = parseList(process.env.LOAD_TEST_PATHS, ['/api/health']);
    const method = String(process.env.LOAD_TEST_METHOD || 'GET').toUpperCase();
    const body = process.env.LOAD_TEST_BODY || '';
    const headers = process.env.LOAD_TEST_HEADERS ? JSON.parse(process.env.LOAD_TEST_HEADERS) : {};

    const scenarioFile = process.env.LOAD_TEST_SCENARIO_FILE;
    const scenarioJson = process.env.LOAD_TEST_SCENARIO_JSON;

    let scenario;
    if (scenarioFile) {
        const resolved = path.resolve(scenarioFile);
        scenario = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } else if (scenarioJson) {
        scenario = JSON.parse(scenarioJson);
    } else {
        scenario = buildScenarioFromLegacyEnv(baseUrl, method, paths, headers, body);
    }

    scenario = expandEnvPlaceholders(scenario);
    scenario.baseUrl = String(scenario.baseUrl || baseUrl).replace(/\/+$/, '');
    scenario.requests = Array.isArray(scenario.requests) ? scenario.requests : [];

    if (scenario.requests.length === 0) {
        throw new Error('Scenario must include at least one request');
    }

    scenario.requests = scenario.requests.map((request, index) => ({
        name: request.name || `request-${index + 1}`,
        method: String(request.method || method || 'GET').toUpperCase(),
        path: request.path || paths[index % paths.length] || '/api/health',
        weight: parseNumber(request.weight, 1),
        headers: request.headers && typeof request.headers === 'object' ? request.headers : headers,
        body: typeof request.body === 'undefined' ? body : request.body,
    }));

    return scenario;
}

function buildWeightedRequests(requests) {
    const bucket = [];
    for (const request of requests) {
        const weight = Math.max(1, Math.round(Number(request.weight || 1)));
        for (let i = 0; i < weight; i += 1) {
            bucket.push(request);
        }
    }
    return bucket;
}

async function main() {
    const scenario = loadScenario();
    const baseUrl = scenario.baseUrl;
    const concurrency = parseNumber(process.env.LOAD_TEST_CONCURRENCY, 100);
    const durationSeconds = parseNumber(process.env.LOAD_TEST_DURATION_SECONDS, 30);
    const timeoutMs = parseNumber(process.env.LOAD_TEST_TIMEOUT_MS, 10000);
    const warmupSeconds = parseNumber(process.env.LOAD_TEST_WARMUP_SECONDS, 3);
    const stopAt = Date.now() + durationSeconds * 1000;
    const requestPool = buildWeightedRequests(scenario.requests);

    let requestCounter = 0;
    let completed = 0;
    let failed = 0;
    const latencies = [];
    const statusCounts = new Map();
    const requestStats = new Map();

    const runOne = async () => {
        while (Date.now() < stopAt) {
            const current = requestCounter++;
            const requestDef = requestPool[current % requestPool.length];
            const requestPath = requestDef.path;
            const url = `${baseUrl}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            const started = performance.now();
            const requestLabel = requestDef.name || requestPath;

            try {
                const response = await fetch(url, {
                    method: requestDef.method,
                    headers: requestDef.headers,
                    body: requestDef.body || undefined,
                    signal: controller.signal,
                });
                const latency = performance.now() - started;
                latencies.push(latency);
                completed += 1;
                statusCounts.set(response.status, (statusCounts.get(response.status) || 0) + 1);
                if (!requestStats.has(requestLabel)) {
                    requestStats.set(requestLabel, { total: 0, failed: 0, statuses: new Map() });
                }
                const requestSummary = requestStats.get(requestLabel);
                requestSummary.total += 1;
                requestSummary.statuses.set(response.status, (requestSummary.statuses.get(response.status) || 0) + 1);
                await response.arrayBuffer().catch(() => {});
            } catch (error) {
                const latency = performance.now() - started;
                latencies.push(latency);
                failed += 1;
                statusCounts.set('ERR', (statusCounts.get('ERR') || 0) + 1);
                if (!requestStats.has(requestLabel)) {
                    requestStats.set(requestLabel, { total: 0, failed: 0, statuses: new Map() });
                }
                const requestSummary = requestStats.get(requestLabel);
                requestSummary.total += 1;
                requestSummary.failed += 1;
                requestSummary.statuses.set('ERR', (requestSummary.statuses.get('ERR') || 0) + 1);
            } finally {
                clearTimeout(timeout);
            }
        }
    };

    console.log(JSON.stringify({
        stage: 'starting',
        scenario: scenario.name || 'unnamed-scenario',
        baseUrl,
        requests: scenario.requests.map((request) => ({
            name: request.name,
            method: request.method,
            path: request.path,
            weight: request.weight,
        })),
        concurrency,
        durationSeconds,
        timeoutMs,
        warmupSeconds,
    }));

    if (warmupSeconds > 0) {
        const warmupStopAt = Date.now() + warmupSeconds * 1000;
        while (Date.now() < warmupStopAt) {
            const warmupRequest = requestPool[0];
            await fetch(`${baseUrl}${warmupRequest.path}`, {
                method: warmupRequest.method,
                headers: warmupRequest.headers,
                body: warmupRequest.body || undefined,
            }).catch(() => {});
        }
    }

    const startedAt = performance.now();
    await Promise.all(Array.from({ length: concurrency }, () => runOne()));
    const totalSeconds = (performance.now() - startedAt) / 1000;
    const sortedLatencies = [...latencies].sort((a, b) => a - b);

    const summary = {
        scenario: scenario.name || 'unnamed-scenario',
        baseUrl,
        concurrency,
        durationSeconds,
        totalRequests: completed + failed,
        completed,
        failed,
        requestsPerSecond: totalSeconds > 0 ? Number(((completed + failed) / totalSeconds).toFixed(2)) : 0,
        latencyMs: {
            p50: Number(percentile(sortedLatencies, 50).toFixed(2)),
            p95: Number(percentile(sortedLatencies, 95).toFixed(2)),
            p99: Number(percentile(sortedLatencies, 99).toFixed(2)),
            max: Number((sortedLatencies[sortedLatencies.length - 1] || 0).toFixed(2)),
        },
        statusCounts: Object.fromEntries(statusCounts),
        requestBreakdown: Object.fromEntries(
            [...requestStats.entries()].map(([name, stats]) => [
                name,
                {
                    total: stats.total,
                    failed: stats.failed,
                    statuses: Object.fromEntries(stats.statuses),
                },
            ])
        ),
    };

    console.log(JSON.stringify({ stage: 'complete', summary }, null, 2));

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        stage: 'error',
        message: error.message,
        stack: error.stack,
    }, null, 2));
    process.exit(1);
});
