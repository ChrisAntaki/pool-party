// Requirements
const _ = require('lodash');
const config = require('../../input/config');
const fs = require('fs');
const moment = require('moment-timezone');
const path = require('path');
const Promise = require('bluebird');

let message = '';

_.each(config.organizations, organization => {
    const swapping = organization.swapping ? '✓' : '✕';
    const sources = `Sources: ${organization.sources}`;
    message += `
(${swapping}) ${organization.name}
        ${sources}`;
    if (swapping && organization.states.length) {
        message += `
        Prefers users from: ${organization.states}`;
    }
    if (swapping && organization.joined) {
        const joined = moment.tz(organization.joined, 'America/New_York').format('MMMM Do YYYY, h:mm:ss a');
        message += `
        Joined: ${joined} (Eastern)`;
    }
    message += '\n';
});

console.log(message);
