'use strict';
var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var parse = require('csv-parse');

class HashCount {
    constructor(params) {
        this.hashes = {};
        this.organization = params.organizations[params.organization];
        this.params = params;
        this.stats = {
            clicks: {
                total: 0,
                unique: 0,
            },
            submissions: {
                first: null,
                total: 0,
                unique: 0,
            },
            total: 0,
            unique: 0,
        };

        if (!this.organization) {
            console.log(`Could not find ${params.organization}.`);
            return;
        }

        async.series([
            this.loadClicks.bind(this),
            this.loadSubmissions.bind(this),
        ], () => {
            this.stats.total = this.stats.clicks.total + this.stats.submissions.total;
            this.stats.unique = _.keys(this.hashes).length;

            console.log(`${this.params.organization} has ${this.stats.unique} total unique hashes, between clicks and submissions.`);

            if (this.params.callback) {
                this.params.callback(1);
            }
        });
    }

    loadClicks(next) {
        var count = 0;
        var hashes = {};
        var parser = parse({
            columns: ['hash'],
        });

        console.log('Loading click hashes.');

        parser.on('finish', () => {
            this.stats.clicks.total = count;
            this.stats.clicks.unique = _.keys(hashes).length;

            console.log(`Total: ${this.stats.clicks.total}`);
            console.log(`Unique: ${this.stats.clicks.unique}`);
            console.log('Finished loading click hashes.');

            _.extend(this.hashes, hashes);

            next();
        });

        parser.on('readable', () => {
            var row;
            while (row = parser.read()) {
                count++;
                hashes[row.hash] = true;
            }
        });

        fs.createReadStream(__dirname + '/../input/clicks-' + this.params.organization + '.csv').pipe(parser);
    }

    loadSubmissions(next) {
        var count = 0;
        var first = null;
        var hashes = {};
        var source = this.organization.source;
        var parser = parse({
            columns: true,
        });

        console.log(`Loading submission hashes with a source of '${source}'.`);

        parser.on('finish', () => {
            this.stats.submissions.first = first;
            this.stats.submissions.total = count;
            this.stats.submissions.unique = _.keys(hashes).length;

            console.log(`Total: ${this.stats.submissions.total}`);
            console.log(`Unique: ${this.stats.submissions.unique}`);
            console.log('Finished loading submission hashes.');

            _.extend(this.hashes, hashes);

            next();
        });

        parser.on('readable', () => {
            var row;
            while (row = parser.read()) {
                if (row.source !== source) {
                    return;
                }

                count++;
                hashes[row.hash] = true;
                if (!first) {
                    first = row.created_at;
                }
            }
        });

        fs.createReadStream(__dirname + '/../input/new.csv').pipe(parser);
    }
}

module.exports = HashCount;
