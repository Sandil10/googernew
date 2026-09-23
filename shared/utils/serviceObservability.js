function createObservability(serviceName = 'service') {
  const startedAt = Date.now();
  const http = {
    total_requests: 0,
    inflight_requests: 0,
    status_counts: {},
    method_counts: {},
    last_request_at: null,
    last_error_at: null,
    total_duration_ms: 0,
  };

  function middleware(req, res, next) {
    const start = Date.now();
    http.total_requests += 1;
    http.inflight_requests += 1;
    http.last_request_at = new Date().toISOString();
    http.method_counts[req.method] = (http.method_counts[req.method] || 0) + 1;

    res.on('finish', () => {
      const status = String(res.statusCode || 0);
      http.inflight_requests = Math.max(0, http.inflight_requests - 1);
      http.status_counts[status] = (http.status_counts[status] || 0) + 1;
      http.total_duration_ms += Date.now() - start;
      if (res.statusCode >= 500) {
        http.last_error_at = new Date().toISOString();
      }
    });

    next();
  }

  function getHttpSnapshot() {
    const avg = http.total_requests > 0 ? http.total_duration_ms / http.total_requests : 0;
    return {
      service: serviceName,
      uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
      total_requests: http.total_requests,
      inflight_requests: http.inflight_requests,
      status_counts: { ...http.status_counts },
      method_counts: { ...http.method_counts },
      average_duration_ms: Number(avg.toFixed(2)),
      last_request_at: http.last_request_at,
      last_error_at: http.last_error_at,
    };
  }

  function buildAlerts(snapshot = {}) {
    const httpSnapshot = snapshot.http || getHttpSnapshot();
    const statusCounts = httpSnapshot.status_counts || {};
    const serverErrors = Object.entries(statusCounts)
      .filter(([status]) => Number(status) >= 500)
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);

    const alerts = [];
    if (serverErrors > 0) {
      alerts.push({
        level: 'warning',
        message: `${serviceName} recorded ${serverErrors} server error response${serverErrors === 1 ? '' : 's'}.`,
      });
    }

    return {
      success: alerts.length === 0,
      service: serviceName,
      alerts,
      generatedAt: new Date().toISOString(),
    };
  }

  function toPrometheus(snapshot = {}) {
    const httpSnapshot = snapshot.http || getHttpSnapshot();
    const lines = [
      `# HELP googer_service_uptime_seconds Service uptime in seconds`,
      `# TYPE googer_service_uptime_seconds gauge`,
      `googer_service_uptime_seconds{service="${serviceName}"} ${httpSnapshot.uptime_seconds || 0}`,
      `# HELP googer_http_requests_total Total HTTP requests`,
      `# TYPE googer_http_requests_total counter`,
      `googer_http_requests_total{service="${serviceName}"} ${httpSnapshot.total_requests || 0}`,
      `# HELP googer_http_inflight_requests Current HTTP requests`,
      `# TYPE googer_http_inflight_requests gauge`,
      `googer_http_inflight_requests{service="${serviceName}"} ${httpSnapshot.inflight_requests || 0}`,
    ];

    for (const [status, count] of Object.entries(httpSnapshot.status_counts || {})) {
      lines.push(`googer_http_status_total{service="${serviceName}",status="${status}"} ${Number(count || 0)}`);
    }

    return `${lines.join('\n')}\n`;
  }

  return {
    middleware,
    getHttpSnapshot,
    buildAlerts,
    toPrometheus,
  };
}

module.exports = { createObservability };
