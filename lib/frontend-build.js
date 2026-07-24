'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveFrontendBuild(
  rootDir,
  nodeEnv = process.env.NODE_ENV,
  distPath = path.join(rootDir, 'dist')
) {
  const indexPath = path.join(distPath, 'index.html');
  const available = fs.existsSync(indexPath) && fs.statSync(indexPath).isFile();

  if (nodeEnv === 'production' && !available) {
    throw new Error(
      '[cheese-wheel] Production frontend build is missing: run `npm run build` before starting the server'
    );
  }

  return {
    available,
    distPath,
    indexPath,
  };
}

module.exports = {
  resolveFrontendBuild,
};
