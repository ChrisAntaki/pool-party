'use strict';

// Modules
let _ = require('lodash');
let fs = require('fs');
let parse = require('csv-parse');
let crypto = require('crypto');

// Class
module.exports = class Submissions {

    constructor(params) {
        this.hashes = {};
        this.params = params;
    }

    parse() {
        return new Promise(this.collect.bind(this));
    }

    collect(fulfill, reject) {
        let input = fs.readFileSync(this.params.path);
        let options = { columns: true };

        parse(input, options, (err, rows) => {
            let submissions = {};

            _.each(rows, (row) => {
                let email = row.email.trim().toUpperCase();
                let hash = crypto.createHash('md5').update(email).digest('hex');
                let submission = submissions[hash];

                if (!submission) {
                    submission = submissions[hash] = {
                        hash: hash,
                        row: row,
                        sources: {},
                        swappable: false,
                    };
                }

                submission.sources[row.source] = true;

                let createdAt = new Date(row.created_at);
                if (!submission.created || submission.created < createdAt) {
                    submission.created = createdAt;
                }

                if (row.swappable === 'consent') {
                    submission.swappable = true;
                }

                delete row.created_at;
                delete row.source;
                delete row.swappable;
            });

            this.hashes = _.values(submissions);

            console.log('Unique submission hashes: ' + this.hashes.length);

            this.swappableHashes = _.filter(this.hashes, submission => submission.swappable);

            console.log('Unique swappable submission hashes: ' + this.swappableHashes.length);

            fulfill(submissions);
        });
    }

}
