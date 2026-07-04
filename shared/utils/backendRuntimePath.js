const fs = require('fs');
const path = require('path');

const candidateRoots = () => {
    const envRoot = String(process.env.GOOGER_BACKEND_ROOT || '').trim();
    return [
        envRoot,
        path.resolve(__dirname, '../../backend'),
        path.resolve(__dirname, '../../googernew/backend'),
        path.resolve(__dirname, '../../googernew-main/backend'),
        path.resolve(process.cwd(), 'backend'),
        path.resolve(process.cwd()),
    ].filter(Boolean);
};

const moduleCandidates = (candidate) => {
    const ext = path.extname(candidate);
    if (ext) {
        return [candidate];
    }

    return [
        candidate,
        `${candidate}.js`,
        `${candidate}.cjs`,
        `${candidate}.mjs`,
        `${candidate}.json`,
        path.join(candidate, 'index.js'),
        path.join(candidate, 'index.cjs'),
        path.join(candidate, 'index.mjs'),
        path.join(candidate, 'index.json'),
    ];
};

const resolveBackendRuntimePath = (...segments) => {
    for (const root of candidateRoots()) {
        const candidate = path.resolve(root, ...segments);
        for (const moduleCandidate of moduleCandidates(candidate)) {
            if (fs.existsSync(moduleCandidate)) {
                return moduleCandidate;
            }
        }
    }

    return path.resolve(candidateRoots()[0] || process.cwd(), ...segments);
};

module.exports = {
    resolveBackendRuntimePath,
};
