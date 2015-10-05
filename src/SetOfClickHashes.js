'use strict';
var fs = require('fs');
var parse = require('csv-parse');

module.exports = class SetOfClickHashes {
    constructor(params) {
        this.hashes = new Set();
        this.matches = new Set();
        this.params = params;
        this.total = 0;

        this.collect();
    }

    collect() {
        var parser = parse({
            columns: ['hash'],
        });

        parser.on('finish', () => {
            this.params.callback();
        });

        parser.on('readable', () => {
            for (var row; row = parser.read();) {
                this.hashes.add(row.hash);

                if (this.params.submissions.hashes.has(row.hash)) {
                    this.matches.add(row.hash);
                }

                this.total += 1;
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }
}
