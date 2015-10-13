'use strict';
const fs = require('fs');
const parse = require('csv-parse');

module.exports = class Submissions {

    constructor(params) {
        this.hashes = {};
        this.params = params;

        this.collect();
    }

    collect() {
        const parser = parse({
            columns: true,
        });

        parser.on('finish', () => {
            this.params.callback();
        });

        parser.on('readable', () => {
            for (let row; row = parser.read();) {
                let hash = this.hashes[row.hash];

                if (!hash) {
                    hash = this.hashes[row.hash] = {
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
