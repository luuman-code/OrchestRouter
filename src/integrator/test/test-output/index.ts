const exportsMap = {};
Object.assign(exportsMap, require('./src/login/loginform'));
Object.assign(exportsMap, require('./src/login/styles'));
Object.assign(exportsMap, require('./src/utils/auth'));
module.exports = exportsMap;