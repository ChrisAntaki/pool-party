// Requirements
const _ = require('lodash');
const beautify = require('js-beautify').js_beautify
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const program = require('commander');
const Promise = require('bluebird');

program
    // .version('0.1.0')
    .option('-s, --save', 'Save the config.json file [false]', false)
    // .option('-f, --filename [config.json]', 'Choose a different filename [config.json]', 'config.json')
    .option('-c, --campaign [ABC]', 'Choose a campaign name [ABC]', 'ABC')
    .parse(process.argv);

const config = {};
config.campaign = program.campaign;
config.organizations = {};

const listings = fs.readdirSync(path.join(__dirname, `../../input/suppression`));
const csvs = _.filter(listings, listing => {
    return listing.match(/.csv$/);
});
_.each(csvs, csv => {
    const org = csv.match(/^\w+/)[0];
    config.organizations[org] = {
        name: org,
        sources: [
            org,
            org + '-emailshare',
            org + '-fbshare',
            org + '-twittershare',
        ],
        states: [],
        swapping: true,
    };
});

const json = beautify(JSON.stringify(config), 4);
if (!program.save) {
    console.log(json);
    process.exit(0);
}

fs.writeFileSync(path.join(__dirname, '../../input/config.json'), json);
console.log('Saved file');
