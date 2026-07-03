const fs = require('fs');
const path = require('path');

const candidateRoots = () => {
    const envRoot = String(process.env.GOOGER_BACKEND_ROOT || '').trim();
    return [
        envRoot,
        path.resolve(__dirname, '../../googernew/backend'),
        path.resolve(__dirname, '../../googernew-main/backend'),
        path.resolve(process.cwd(), 'backend'),
        path.resolve(process.cwd()),
    ].filter(Boolean);
};

const resolveBackendRuntimePath = (...segments) => {
    for (const root of candidateRoots()) {
        const candidate = path.resolve(root, ...segments);
        if (fs.existsSync(candidate)) return candidate;
    }

    return path.resolve(candidateRoots()[0] || process.cwd(), ...segments);
};

module.exports = {
    resolveBackendRuntimePath,
};
