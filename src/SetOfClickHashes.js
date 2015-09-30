'use strict';
var fs = require('fs');
var parse = require('csv-parse');

module.exports = class SetOfClickHashes {
    constructor(params) {
        this.hashes = new Set();
        this.params = params;

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
                if (this.params.submissions.hashes.has(row.hash)) {
                    this.hashes.add(row.hash);
                }
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }
}
