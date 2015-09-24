'use strict';
var _ = require('lodash');
var async = require('async');
var beautify = require('js-beautify').js_beautify;
var fs = require('fs');
var HashCount = require('./HashCount');

class HashCounts {
    constructor(params) {
        var counts = {};
        var organizations = params.organizations;
        var stats = {};

        console.log('Loading stats from each organization...');
        console.log('- - - - - - -');

        async.forEachOfSeries(organizations, (value, key, next) => {
            counts[key] = new HashCount({
                callback: () => {
                    console.log('- - - - - - -');
                    next();
                },
                organization: key,
                organizations: organizations,
            });
        }, (err) => {
            _.each(counts, (count, key) => {
                stats[key] = count.stats;
            });

            var json = beautify(JSON.stringify(stats), {
                indent_size: 4,
            });

            console.log('Saving counts to "output/counts.json".');

            fs.writeFile('output/counts.json', json);
        });
    }
}

module.exports = HashCounts;
