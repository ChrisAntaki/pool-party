'use strict';
var fs = require('fs');
var parse = require('csv-parse');

module.exports = class SetOfSubmissionHashes {
    constructor(params) {
        this.hashes = new Set();
        this.params = params;

        this.collect();
    }

    collect() {
        var parser = parse({
            columns: true,
        });

        parser.on('finish', () => {
            this.params.callback();
        });

        parser.on('readable', () => {
            var row;
            while (row = parser.read()) {
                this.hashes.add(row.hash);
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }
}
