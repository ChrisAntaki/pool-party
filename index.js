'use strict';

const async = require('async');
const config = require('./src/config');
const fs = require('fs');
const Organization = require('./src/Organization');
const parse = require('csv-parse');
const path = require('path');
const Submissions = require('./src/Submissions');

// Flow
let storage = {};
async.series([
    // Verify CLI argument
    (next) => {
        if (!config.get('algorithm')) {
            next('Please enter an algorithm as a CLI argument. Ex: YouGetWhatYouGive')
        } else {
            next();
        }
    },

    // Organizations
    (next) => {
        storage.organizations = [];
        async.eachSeries(config.get('organizations'), (organizationJSON, next) => {
            console.log(`Collecting suppressed hashes for ${organizationJSON.name}`);
            const organization = new Organization({
                callback: next,
                json: organizationJSON,
                path: path.join(__dirname, `input/org-${organizationJSON.sources[0]}.csv`),
            });
            storage.organizations.push(organization);
        }, next);
    },

    // Submissions
    (next) => {
        console.log(`Collecting submissions`);
        storage.submissions = new Submissions({
            callback: next,
            path: path.join(__dirname, `input/submissions.csv`),
        });
    },

    // Swap
    (next) => {
        const Algorithm = require('./src/algorithms/' + config.get('algorithm'));
        new Algorithm({
            callback: next,
            organizations: storage.organizations,
            submissions: storage.submissions,
        });
    },
], (err) => {
    if (err) {
        console.log(err);
    }

    console.log('The end');
});
