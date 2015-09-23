var HashCount = require('./src/HashCount');

var credoCount = new HashCount({
    organization: process.argv[2],
    organizations: require('./input/organizations'),
});
