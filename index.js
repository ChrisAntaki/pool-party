'use strict';

let _ = require('lodash');
let bluebird = require('bluebird');
let chalk = require('chalk');
let config = require('./src/config');
let Organization = require('./src/Organization');
let path = require('path');
let Submissions = require('./src/Submissions');

bluebird.coroutine(function* () {
    // Verify CLI arguments
    if (!config.get('algorithm')) {
        throw `Please enter an algorithm as a CLI argument. Ex: YouGetWhatYouGive`;
    }

    // Submissions
    console.log(`Collecting submissions...`);

    let submissions = new Submissions({
        path: path.join(__dirname, 'input/submissions.csv'),
    });

    yield submissions.parse();

    // Organizations
    let organizations = [];

    console.log(`Collecting suppressed hashes...`);

    _.each(config.get('organizations'), (organizationJSON) => {
        console.log(`- ${chalk.blue(organizationJSON.name)}`);

        let organization = new Organization({
            json: organizationJSON,
        });

        organizations.push(organization);
    });

    // Swap
    let Algorithm = require('./src/algorithms/' + config.get('algorithm'));

    new Algorithm({
        organizations: organizations,
        submissions: submissions,
    });
})();
