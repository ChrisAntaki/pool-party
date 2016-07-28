// Modules
var config = require('nconf');
var path = require('path');

// Multi-source configuration
config
    .argv({
        'algorithm': {
            default: 'Olympic',
            // describe: '',
        },
        'cordiality': {
            default: '3',
            // describe: '',
        },
    })
    .env()
    .file({
        file: path.join(__dirname, '../input/config.json'),
    });

module.exports = config;
