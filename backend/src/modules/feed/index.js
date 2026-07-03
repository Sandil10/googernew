const feedController = require('./feedController');
const googEngagementController = require('./googEngagementController');
const googEngagementRepository = require('./googEngagementRepository');
const googEngagementService = require('./googEngagementService');
const googInteractionController = require('./googInteractionController');
const googInteractionService = require('./googInteractionService');
const googMutationController = require('./googMutationController');
const googMutationService = require('./googMutationService');
const googReadController = require('./googReadController');
const homeFeedRepository = require('./homeFeedRepository');
const homeFeedService = require('./homeFeedService');
const googReadRepository = require('./googReadRepository');
const googReadService = require('./googReadService');

module.exports = {
    feedController,
    googEngagementController,
    googEngagementRepository,
    googEngagementService,
    googInteractionController,
    googInteractionService,
    googMutationController,
    googMutationService,
    getHomeFeed: feedController.getHomeFeed,
    googReadController,
    googReadRepository,
    googReadService,
    homeFeedRepository,
    homeFeedService,
};
