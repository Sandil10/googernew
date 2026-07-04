const processReportGenerationRequested = async ({ job }) => {
    console.log('[background-worker] report generation job reserved for reporting-service split:', job.id);
};

module.exports = {
    processReportGenerationRequested,
};
