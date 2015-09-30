'use strict';
var async = require('async');
var beautify = require('js-beautify').js_beautify;
var fs = require('fs');
var organizations = require('./input/organizations');
var path = require('path');
var SetOfClickHashes = require('./src/SetOfClickHashes');
var SetOfSubmissionHashes = require('./src/SetOfSubmissionHashes');

var submissions;

async.series([
    // Collect submission hashes
    (next) => {
        console.log('Loading submissions');

        submissions = new SetOfSubmissionHashes({
            callback: next,
            path: path.join(__dirname, 'input/new.csv'),
        });
    },

    // Collect clicks
    (next) => {
        async.eachSeries(organizations, (organization, next) => {
            var clicks = new SetOfClickHashes({
                callback: () => {
                    organization.clicks = clicks.hashes.size;

                    console.log(organization);

                    next();
                },
            path: path.join(__dirname, `input/clicks-${organization.source}.csv`),
                submissions: submissions,
            });
        }, next);
    },
], (err) => {
    if (err) {
        console.log(err);
    }

    var data = JSON.stringify(organizations);
    var prettyData = beautify(data, {
        indent_size: 4,
    });

    console.log('Saved results to output/counts.json');
    fs.writeFile(path.join(__dirname, 'output/counts.json'), prettyData);
});
