'use strict';
const _ = require('lodash');
const fs = require('fs');
const parse = require('csv-parse');

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
                let hash = submissions[row.hash];

                if (!hash) {
                    hash = submissions[row.hash] = {
                        hash: row.hash,
                        sources: {},
                    };
                }

                hash.sources[row.source] = true;
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }

}
