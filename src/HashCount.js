'use strict';
var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var parse = require('csv-parse');

class HashCount {
    constructor(params) {
        this.hashes = {
            clicks: new Set(),
            submissions: new Set(),
        };
        this.organization = params.organizations[params.organization];
        this.params = params;

        if (!this.organization) {
            console.log(`Could not find ${params.organization}.`);
            return;
        }

        async.series([
            this.loadClicks.bind(this),
            this.loadSubmissions.bind(this),
        ], () => {
            if (this.params.callback) {
                this.params.callback(1);
            }
        });
    }

    // Clicks
    loadClicks(next) {
        var parser = parse({
            columns: ['hash'],
        });

        console.log('Loading click hashes.');

        parser.on('finish', () => {
            console.log('Finished loading click hashes.');

            next();
        });

        parser.on('readable', () => {
            var row;
            while (row = parser.read()) {
                this.hashes.clicks.add(row.hash);
            }
        });

        fs.createReadStream(__dirname + '/../input/clicks-' + this.params.organization + '.csv').pipe(parser);
    }

    // Submissions
    loadSubmissions(next) {
        var parser = parse({
            columns: true,
        });

        console.log(`Collecting matching submission hashes.`);

        parser.on('finish', () => {
            console.log('Finished collecting matching submission hashes.');

            next();
        });

        parser.on('readable', () => {
            var row;
            while (row = parser.read()) {
                if (!this.hashes.clicks.has(row.hash)) {
                    this.hashes.submissions.add(row.hash);
                }
            }
        });

        fs.createReadStream(__dirname + '/../input/new.csv').pipe(parser);
    }
}

module.exports = HashCount;
