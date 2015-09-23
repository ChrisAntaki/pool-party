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

        if (!this.organization) {
            console.log(`Could not find ${params.organization}.`);
            return;
        }

        async.series([
            this.loadClicks.bind(this),
            this.loadSubmissions.bind(this),
        ], () => {
            console.log(`${this.params.organization} has ${_.keys(this.hashes).length} total unique hashes, between clicks and submissions.`);
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
            console.log(`Total: ${count}`);
            console.log(`Unique: ${_.keys(hashes).length}`);
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
        var hashes = {};
        var source = this.organization.source;
        var parser = parse({
            columns: true,
        });

        console.log(`Loading submission hashes with a source of '${source}'.`);

        parser.on('finish', () => {
            console.log(`Total: ${count}`);
            console.log(`Unique: ${_.keys(hashes).length}`);
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
            }
        });

        fs.createReadStream(__dirname + '/../input/new.csv').pipe(parser);
    }
}

module.exports = HashCount;
