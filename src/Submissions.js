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
            for (let submission; submission = parser.read();) {
                this.hashes[submission.hash] = submission;
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }

}
