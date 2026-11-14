const pc = require(require.resolve('puppeteer-core', { paths: ['/home/user/wt/visit'] }));
const launch = pc.launch.bind(pc);
pc.launch = (o = {}) => launch({ ...o, args: [...(o.args || []), '--no-sandbox'] });
