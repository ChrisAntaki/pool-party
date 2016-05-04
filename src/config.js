// Modules
var config = require('nconf');
var path = require('path');

// Multi-source configuration
config
    .argv({
        'algorithm': {
            default: 'YouGetWhatYouGive',
            // describe: '',
        },
        'cordiality': {
            default: '1',
            // describe: '',
        },
    })
    .env()
    .file({
        file: path.join(__dirname, '../input/config.json'),
    });

module.exports = config;
