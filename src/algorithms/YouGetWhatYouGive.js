'use strict';

// Modules
const _ = require('lodash');
const async = require('async');
const Organization = require('../Organization');
const Submissions = require('../Submissions');

// Modifications
Organization.prototype.requestHash = (params) => {
    console.log('TODO: Request hash');
}

Organization.prototype.giveHash = (params) => {
    console.log('TODO: Give hash');
}

// Class
module.exports = class YouGetWhatYouGive {

    constructor(params) {
        this.callback = params.callback;
        this.free = {};
        this.organizations = params.organizations;
        this.submissions = params.submissions;

        this.start();
    }

    start() {
        async.series([
            // Updating organization objects
            (next) => {
                _.each(this.organizations, (organization) => {
                    organization.given = [];
                    organization.received = [];
                    organization.sourced = {};
                });

                next();
            },

            // Assigning submissions to organizations
            (next) => {
                let sourceMap = {};

                _.each(this.organizations, (organization) => {
                    organization.sources.forEach((source) => {
                        sourceMap[source] = organization;
                    });
                });

                _.each(this.submissions, (submission) => {
                    let organization = sourceMap[submission.source];
                    if (organization) {
                        organization.sourced[submission.hash] = submission;
                    } else {
                        this.free[submission.hash] = submission;
                    }
                });

                next();
            },

            // Swap
            (next) => {
                for (;;) {
                    let fails = 0;
                    let givingOrganizations = this.getShuffledListOfGivingOrganizations();
                    _.each(givingOrganizations, (givingOrganization) => {
                        console.log(givingOrganization.name + ' is giving to:');
                        let owedOrganizations = this.getShuffledListOfOwedOrganizations({
                            except: givingOrganization,
                        });
                        let success = false;

                        _.each(owedOrganizations, (owedOrganization) => {
                            console.log('- ' + owedOrganization.name);
                            let desiredHash = owedOrganization.requestHash({
                                from: givingOrganization,
                            });

                            if (desiredHash) {
                                console.log('We found a match!');
                                givingOrganization.giveHash({
                                    to: owedOrganization,
                                });

                                success = true;
                                _.pull(owedOrganizations, owedOrganization);
                                return false;
                            }
                        });

                        if (!success) {
                            fails++;
                        }
                    });

                    if (fails === givingOrganizations.length) {
                        console.log('Ran out of hashes to give.');
                        break;
                    }
                }
            },

            // Save
            (next) => {
                console.log('Yay!');
            },
        ], this.swap);
    }

    getShuffledListOfGivingOrganizations() {
        return _.shuffle(_.filter(this.organizations, (organization) => {
            return organization.given.length <= organization.received.length;
        }));
    }

    getShuffledListOfOwedOrganizations(params) {
        return _.shuffle(_.filter(this.organizations, (organization) => {
            return (
                organization !== params.except
                &&
                organization.given.length >= organization.received.length
            );
        }));
    }

}
