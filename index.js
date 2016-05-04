// Config
var config = require('./src/config');

// Requirements
var _ = require('lodash');
var Algorithm = require('./src/algorithms/' + config.get('algorithm'));
var chalk = require('chalk');
var Organization = require('./src/Organization');
var path = require('path');
var Submissions = require('./src/Submissions');

// Verify CLI arguments
if (!config.get('algorithm')) {
    throw `Please enter an algorithm as a CLI argument. Ex: YouGetWhatYouGive`;
}

// Organizations
var organizations = [];

console.log(`Collecting suppressed hashes...`);

_.each(config.get('organizations'), (organizationJSON) => {
    console.log(`- ${chalk.blue(organizationJSON.name)}`);

    var organization = new Organization({
        json: organizationJSON,
    });

    organizations.push(organization);
});

// Submissions
console.log(`Collecting submissions...`);

var submissions = new Submissions({
    path: path.join(__dirname, 'input/submissions.csv'),
});

submissions.parse().then(f => {
    new Algorithm({
        organizations: organizations,
        submissions: submissions,
    });
});
