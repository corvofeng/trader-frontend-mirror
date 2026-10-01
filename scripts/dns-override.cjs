const dns = require('dns');
const originalLookup = dns.lookup;
const MAP = {
  'api.cloudflare.com': '104.19.192.29',
  'dash.cloudflare.com': '104.19.192.29',
  'workers.cloudflare.com': '104.19.192.29',
};

dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (MAP[hostname]) {
    const ip = MAP[hostname];
    if (options && options.all) {
      return callback(null, [{ address: ip, family: 4 }]);
    }
    return callback(null, ip, 4);
  }
  return originalLookup.call(this, hostname, options, callback);
};
