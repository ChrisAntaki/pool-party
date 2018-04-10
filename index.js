// Config
const config = require('./src/config');

// Requirements
const _ = require('lodash');
const Algorithm = require('./src/algorithms/' + config.get('algorithm'));
const chalk = require('chalk');
const Organization = require('./src/organization');
const path = require('path');
const Submissions = require('./src/submissions');

// Verify CLI arguments
if (!config.get('algorithm')) {
    throw `Please enter an algorithm as a CLI argument. Ex: YouGetWhatYouGive`;
}

// Organizations
const organizations = [];

console.log(`Collecting suppressed hashes...`);

_.each(config.get('organizations'), (organizationJSON) => {
    console.log(`- ${chalk.yellow(organizationJSON.name)}`);

    const organization = new Organization({
        json: organizationJSON,
    });

    organizations.push(organization);
});

// Submissions
console.log(`Collecting submissions...`);

const submissions = new Submissions({
    path: path.join(__dirname, 'input/submissions.csv'),
});

submissions.parse().then(() => {
    new Algorithm({
        organizations: organizations,
        submissions: submissions,
    });
});
