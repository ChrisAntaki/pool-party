var HashCount = require('./src/HashCount');

if (!process.argv[2]) {
    console.log('Please enter an organization tag. Ex: credo');
    process.exit();
}

new HashCount({
    organization: process.argv[2],
    organizations: require('./input/organizations'),
});
