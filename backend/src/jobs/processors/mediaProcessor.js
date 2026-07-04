const processMediaCompressionRequested = async ({ job }) => {
    console.log('[background-worker] media compression job reserved for media-service split:', job.id);
};

module.exports = {
    processMediaCompressionRequested,
};
