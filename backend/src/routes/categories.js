const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authenticateToken = require('../middleware/auth');
const { createPublicResponseCache } = require('../middleware/publicResponseCache');

router.get(
    '/tree',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_CATEGORY_TREE_CACHE_TTL_MS || 10000),
        keyPrefix: 'category-tree',
    }),
    categoryController.getCategoryTree
);
router.get('/admin/tree', authenticateToken, categoryController.getAdminCategoryTree);
router.get(
    '/commission/global',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_CATEGORY_COMMISSION_CACHE_TTL_MS || 10000),
        keyPrefix: 'category-commission-global',
    }),
    categoryController.getGlobalCategoryCommission
);
router.get(
    '/commission/manual-enabled',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_CATEGORY_COMMISSION_CACHE_TTL_MS || 10000),
        keyPrefix: 'category-commission-manual-enabled',
    }),
    categoryController.getManualCategoryCommissionEnabled
);
router.put('/commission/global', authenticateToken, categoryController.setGlobalCategoryCommission);
router.put('/commission/manual-enabled', authenticateToken, categoryController.setManualCategoryCommissionEnabled);
router.post('/', authenticateToken, categoryController.createCategory);
router.put('/:id', authenticateToken, categoryController.updateCategory);
router.delete('/:id', authenticateToken, categoryController.deleteCategory);

module.exports = router;
