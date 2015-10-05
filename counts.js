'use strict';
var async = require('async');
var beautify = require('js-beautify').js_beautify;
var fs = require('fs');
var organizations = require('./input/organizations');
var path = require('path');
var SetOfClickHashes = require('./src/SetOfClickHashes');
var SetOfListHashes = require('./src/SetOfListHashes');
var SetOfSubmissionHashes = require('./src/SetOfSubmissionHashes');

var submissions;

async.series([
    // Collect submission hashes
    (next) => {
        console.log('Loading submissions');

        submissions = new SetOfSubmissionHashes({
            callback: () => {
                console.log('Unique submissions: ' + submissions.hashes.size);

                next();
            },
            path: path.join(__dirname, 'input/new.csv'),
        });
    },

    // Analyze organizations
    (next) => {
        async.eachSeries(organizations, (organization, next) => {
            console.log('Analyzing ' + organization.name);
            async.series([
                // Clicks
                (next) => {
                    console.log(' - Clicks');

                    var clicks = new SetOfClickHashes({
                        callback: () => {
                            organization.clicks = {
                                total: clicks.total,
                                unique: clicks.hashes.size,
                                matches: clicks.matches.size,
                            };

                            next();
                        },
                        path: path.join(__dirname, `input/clicks-${organization.source}.csv`),
                        submissions: submissions,
                    });
                },

                // List
                (next) => {
                    console.log(' - List');

                    var list = new SetOfListHashes({
                        callback: () => {
                            organization.list = {
                                total: list.total,
                                unique: list.hashes.size,
                                misses: list.misses.size,
                            };

                            next();

                            // // Saving misses
                            // var data = JSON.stringify(Array.from(list.misses));
                            // var prettyData = beautify(data, {
                            //     indent_size: 4,
                            // });

                            // fs.writeFile(path.join(__dirname, `output/misses-${organization.source}.csv`), prettyData, next);
                        },
                        path: path.join(__dirname, `input/org-${organization.source}.csv`),
                        submissions: submissions,
                    });
                },
            ], (err) => {
                console.log(organization);

                next(err);
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
    fs.writeFile(path.join(__dirname, 'output/counts.json'), prettyData, (err) => {
        process.exit();
    });
});
