'use strict';

// Modules
const async = require('async');
const fs = require('fs');
const Organization = require('./src/Organization');
const parse = require('csv-parse');
const path = require('path');
const Submissions = require('./src/Submissions');

// Flow
const config = require('./input/config.json');
let storage = {};
async.series([
    // Verify CLI argument
    (next) => {
        if (!process.argv[2]) {
            next('Please enter an algorithm as a CLI argument. Ex: YouGetWhatYouGive')
        } else {
            next();
        }
    },

    // Organizations
    (next) => {
        storage.organizations = [];
        async.eachSeries(config.organizations, (organizationJSON, next) => {
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
        const Algorithm = require('./src/algorithms/' + process.argv[2]);
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
