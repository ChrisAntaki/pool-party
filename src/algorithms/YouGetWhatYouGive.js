'use strict';

// Modules
const _ = require('lodash');
const async = require('async');
const fs = require('fs');
const Organization = require('../Organization');
const path = require('path');
const Submissions = require('../Submissions');

// Modifications
Organization.prototype.requestSubmission = function requestSubmission (params) {
    let eligible = params.free ? this.eligible.free : this.eligible[params.from.sources[0]];
    let lostIndexes = [];
    let submission = _.find(eligible, (submission, index) => {
        if (!params.given[submission.hash]) {
            return true;
        } else {
            lostIndexes.push(index);
            return false;
        }
    });

    if (lostIndexes.length > 0) {
        _.pullAt(eligible, lostIndexes);
    }

    return submission;
}

Organization.prototype.giveSubmission = function giveSubmission (params) {
    let submission = params.submission;
    params.given[submission.hash] = submission;
    params.to.received.push(submission);
    this.given.push(submission);
}

Organization.prototype.takeFreeSubmission = function takeFreeSubmission (params) {
    let submission = params.submission;
    params.given[submission.hash] = submission;
    this.received.push(submission);
    this.freeCount++;
}

// Class
module.exports = class YouGetWhatYouGive {

    constructor(params) {
        this.callback = params.callback;
        this.free = [];
        this.given = {};
        this.organizations = params.organizations;
        this.submissions = params.submissions;

        this.start();
    }

    start() {
        async.series([
            // Modifying organization and submissions objects
            (next) => {
                _.each(this.organizations, (organization) => {
                    organization.eligible = {};
                    organization.freeCount = 0;
                    organization.given = [];
                    organization.received = [];
                });

                _.each(this.submissions.hashes, (submission) => {
                    submission.eligible = [];
                });

                next();
            },

            // Assigning submissions to organizations
            (next) => {
                console.log('Assigning submissions to organizations');
                let sourceMap = {};

                _.each(this.organizations, (organization) => {
                    _.each(organization.sources, (source) => {
                        sourceMap[source] = organization;
                    });
                });

                _.each(this.submissions.hashes, (submission) => {
                    let matched = false;

                    _.each(_.keys(submission.sources), (source) => {
                        let organization = sourceMap[source];
                        if (organization) {
                            submission.sources[organization.sources[0]] = organization;
                            matched = true;
                        } else {
                            delete submission.sources[source];
                        }
                    });

                    if (!matched) {
                        this.free.push(submission);
                    }
                });

                next();
            },

            // Finding eligible hashes for each organization
            (next) => {
                console.log('Finding eligible hashes for each organization');
                // Creating eligibity arrays
                _.each(this.organizations, (organization) => {
                    _.each(this.organizations, (otherOrganization) => {
                        if (organization === otherOrganization) {
                            return;
                        }

                        organization.eligible[otherOrganization.sources[0]] = [];
                    });

                    organization.eligible.free = [];
                });

                // Assigning eligiblity to submissions
                _.each(this.organizations, (organization) => {
                    _.each(this.submissions.hashes, (submission) => {
                        if (!organization.hashes[submission.hash]) {
                            submission.eligible.push(organization);

                            if (_.isEmpty(submission.sources)) {
                                organization.eligible.free.push(submission);
                            } else {
                                _.each(submission.sources, (otherOrganization) => {
                                    if (organization === otherOrganization) {
                                        return;
                                    }

                                    organization.eligible[otherOrganization.sources[0]].push(submission);
                                });
                            }
                        }
                    });
                });

                console.log('Sorting eligible hashes');
                _.each(this.organizations, (organization) => {
                    _.each(organization.eligible, (eligible) => {
                        eligible.sort((a, b) => {
                            return a.eligible.length - b.eligible.length;
                        });
                    });
                });

                next();
            },

            // Swap
            (next) => {
                console.log('Starting swap!');
                async.forever((next) => {
                    let fails = 0;

                    let givingOrganizations = this.getShuffledListOfGivingOrganizations();

                    _.each(givingOrganizations, (givingOrganization) => {
                        let owedOrganizations = this.getShuffledListOfOwedOrganizations({
                            except: givingOrganization,
                        });

                        let success = false;

                        _.each(owedOrganizations, (owedOrganization) => {
                            let desiredSubmission = owedOrganization.requestSubmission({
                                from: givingOrganization,
                                given: this.given,
                            });

                            if (desiredSubmission) {
                                givingOrganization.giveSubmission({
                                    given: this.given,
                                    submission: desiredSubmission,
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
                        next(1);
                    } else {
                        next();
                    }
                }, () => {
                    console.log('Trading has halted');
                    next();
                });
            },

            // Distributing free submissions
            (next) => {
                console.log('Distributing free submissions');
                let freeCount = 0;
                let givenCount = _.size(this.given);

                async.forever((next) => {
                    let organization = _.max(this.organizations, (organization) => {
                        let freeShare = (organization.freeCount / freeCount) || 0;
                        let givenShare = organization.given.length / givenCount;
                        return givenShare - freeShare;
                    });

                    let submission = organization.requestSubmission({
                        free: true,
                        given: this.given,
                    });

                    if (!submission) {
                        next(1);
                        return;
                    }

                    organization.takeFreeSubmission({
                        given: this.given,
                        submission: submission,
                    });

                    freeCount++;

                    next();
                }, (err) => {
                    next();
                });
            },

            // Save
            (next) => {
                console.log('Saving hashes for each organization');
                _.each(this.organizations, (organization) => {
                    let data = '';

                    _.each(organization.received, (submission) => {
                        data += submission.hash + '\n';
                    });

                    fs.writeFileSync(path.join(__dirname, `../../output/hashes-${organization.sources[0]}.csv`), data);
                });

                next();
            },
        ], (err) => {
            if (err) {
                console.log(err);
            }

            this.printStatus();

            console.log('Hash files are ready!');
        });
    }

    printStatus() {
        console.log('-------');

        let count = 0;
        _.each(this.organizations, (organization) => {
            let keyCount = organization.received.length;
            console.log(`${organization.sources[0]} : ${keyCount} (${organization.freeCount})`);
            count += keyCount;
        });

        console.log('-------');
    }

    getShuffledListOfGivingOrganizations() {
        return _.shuffle(_.filter(this.organizations, (organization) => {
            return (
                organization.given.length <= organization.received.length
            );
        }));
    }

    getShuffledListOfOwedOrganizations(params) {
        return _.filter(this.organizations, (organization) => {
            return (
                organization !== params.except
                &&
                organization.given.length >= organization.received.length
            );
        }).sort((a, b) => {
            let scoreA = a.given.length - a.received.length;
            let scoreB = b.given.length - b.received.length;
            return scoreB - scoreA;
        });
    }

}
