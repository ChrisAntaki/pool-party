// Requirements
var _ = require('lodash');
var config = require('../input/config');
var execute = require('child_process').execSync;
var fs = require('fs');
var generate = require('./password').generate;
var path = require('path');
var Promise = require('bluebird');

// Promises
var stringify = Promise.promisify(require('csv-stringify'));

// Make directory
try {
    execute('mkdir encrypted', {
        cwd: path.join(__dirname, '../output'),
    });
} catch(e) {
    // Already created
}

// Clean up
try {
    execute('rm *.csv *.tmp *.7z *.7', {
        cwd: path.join(__dirname, '../output/encrypted'),
    });
} catch(e) {
    // Already clean
}

// Collect passwords
var passwords = [];

// Create encrypted archives
_.each(config.organizations, organization => {
    var name = organization.name;
    var password = generate(32);
    var source = organization.sources[0];

    passwords.push({
        name: name,
        source: source,
        password: password,
    });

    console.log(`Creating archive for ${name}`);

    var command = `7z a -t7z encrypted/${source}.7z ${source}-* -p"${password}"`;
    execute(command, {
        cwd: path.join(__dirname, '../output'),
    });
});

// Save passwords
stringify(passwords, {
    header: true,
    quoted: true,
}).then(csv => {
    fs.writeFileSync(path.join(__dirname, `../output/encrypted/passwords.csv`), csv);

    // Archive everything
    console.log('Archiving everything');
    var password = generate(32);
    execute(`7z a -t7z ${config.campaign}-pool-party.7 * -p"${password}"`, {
        cwd: path.join(__dirname, '../output/encrypted'),
    });

    // Clean up
    try {
        execute('rm *.csv *.7z', {
            cwd: path.join(__dirname, '../output/encrypted'),
        });
    } catch (e) {
        // Already clean
    }

    // Renaming
    execute(`mv ${config.campaign}-pool-party.7 ${config.campaign}-pool-party.7z`, {
        cwd: path.join(__dirname, '../output/encrypted'),
    });

    // Finishing
    console.log(`Finished! The archive's password is ${password}`);
});
