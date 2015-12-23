'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const parse = require('csv-parse');
const crypto = require('crypto');

// Class
module.exports = class Submissions {

    constructor(params) {
        this.hashes = {};
        this.params = params;

        this.collect();
    }

    collect() {
        let submissions = {};

        const parser = parse({
            columns: true,
        });

        parser.on('finish', () => {
            this.hashes = _.values(submissions);

            console.log('Unique submission hashes: ' + this.hashes.length);

            this.params.callback();
        });

        parser.on('readable', () => {
            for (let row; row = parser.read();) {
                const email = row.email.trim().toUpperCase();
                const hash = crypto.createHash('md5').update(email).digest('hex');
                let submission = submissions[hash];

                if (!submission) {
                    submission = submissions[hash] = {
                        hash: hash,
                        row: row,
                        sources: {},
                    };
                }

                submission.created = new Date(row.created_at);
                submission.sources[row.source] = true;

                delete row.created_at;
                delete row.source;
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }

}
