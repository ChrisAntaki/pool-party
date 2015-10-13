'use strict';

// Modules
const async = require('async');
const fs = require('fs');
const Organization = require('./src/Organization');
const parse = require('csv-parse');
const path = require('path');
const Submissions = require('./src/Submissions');

// Flow
var config = require('./input/config.json');
var storage = {};
async.series([
    // Organizations
    (next) => {
        storage.organizations = [];
        async.eachSeries(config.organizations, (organizationJSON, next) => {
            console.log(`Collecting suppressed hashes for ${organizationJSON.name}`);
            let organization = new Organization({
                callback: next,
                json: organizationJSON,
                path: path.join(__dirname, `input/org-${organizationJSON.sources[0]}.csv`),
            });
            storage.organizations.push(organization);
        }, (err) => {
            console.log('Suppressed hashes were collected');
            next(err);
        });
    },

    // Submissions
    (next) => {
        storage.submissions = new Submissions({
            callback: next,
            path: path.join(__dirname, `input/new.csv`),
        });
    },

    // Test
    (next) => {
        let Algorithm = require('./src/algorithms/YouGetWhatYouGive');
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

    console.log('Hey!');
});
