'use strict';
var fs = require('fs');
var parse = require('csv-parse');

module.exports = class SetOfListHashes {

    constructor(params) {
        this.hashes = new Set();
        this.misses = new Set();
        this.params = params;
        this.total = 0;

        this.collect();
    }

    collect() {
        var parser = parse({
            columns: ['hash'],
        });

        parser.on('finish', () => {
            this.countMisses();
        });

        parser.on('readable', () => {
            for (var row; row = parser.read();) {
                this.hashes.add(row.hash);

                this.total += 1;
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }

    countMisses() {
        this.params.submissions.hashes.forEach((hash) => {
            if (!this.hashes.has(hash)) {
                this.misses.add(hash);
            }
        });

        this.params.callback();
    }

}
