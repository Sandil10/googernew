const categoryReadController = require('./categoryReadController');
const categoryReadRepository = require('./categoryReadRepository');
const categoryReadService = require('./categoryReadService');
const interactionController = require('./interactionController');
const interactionService = require('./interactionService');
const mutationController = require('./mutationController');
const mutationService = require('./mutationService');
const productReadController = require('./productReadController');
const productReadRepository = require('./productReadRepository');
const productReadService = require('./productReadService');
const reportController = require('./reportController');
const reportRepository = require('./reportRepository');
const reportService = require('./reportService');
const shareLookupController = require('./shareLookupController');
const shareLookupService = require('./shareLookupService');

module.exports = {
    categoryReadController,
    categoryReadRepository,
    categoryReadService,
    interactionController,
    interactionService,
    mutationController,
    mutationService,
    productReadController,
    productReadRepository,
    productReadService,
    reportController,
    reportRepository,
    reportService,
    shareLookupController,
    shareLookupService,
};
