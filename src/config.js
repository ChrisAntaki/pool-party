'use strict';

// Modules
let config = require('nconf');
let path = require('path');

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
