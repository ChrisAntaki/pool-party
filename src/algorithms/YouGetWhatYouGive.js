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
        this.highestSwapCount = 0 || +process.argv[4];
        this.organizations = params.organizations;
        this.submissions = params.submissions;

        console.log(`Swap count to beat is ${this.highestSwapCount}`);

        async.timesSeries(+process.argv[3], (n, next) => {
            console.log(`Starting algorithm iteration ${n + 1} of ${process.argv[3]} total`);

            this.start(next);
        });
    }

    start(next) {
        async.series([
            // Resetting instance variables
            (next) => {
                this.free = [];
                this.given = {};

                next();
            },

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
                    submission.sourceObjects = [];

                    let matched = false;

                    _.each(_.keys(submission.sources), (source) => {
                        let organization = sourceMap[source];
                        if (organization) {
                            submission.sourceObjects.push(organization);
                            matched = true;
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

                    // Used to determine rarity of submission
                    organization.eligible.free = [];
                });

                // Assigning eligiblity to submissions
                _.each(this.submissions.hashes, (submission) => {
                    let isFree = submission.sourceObjects.length === 0;

                    _.each(this.organizations, (organization) => {
                        // Skip suppressed hashes
                        if (organization.hashes[submission.hash]) {
                            return;
                        }

                        // Used to determine rarity of submission
                        submission.eligible.push(organization);

                        if (isFree) {
                            organization.eligible.free.push(submission);
                        } else {
                            _.each(submission.sourceObjects, (otherOrganization) => {
                                if (organization === otherOrganization) {
                                    return;
                                }

                                organization.eligible[otherOrganization.sources[0]].push(submission);
                            });
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

            // Save, if swap count is higher than a previous iteration
            (next) => {
                let count = this.getSwapCount();
                if (this.highestSwapCount < count) {
                    console.log(`:) The new count (${count}) is larger than the existing count (${this.highestSwapCount}).`);
                    this.highestSwapCount = count;
                } else {
                    console.log(`:/ The new count (${count}) is smaller than the existing count (${this.highestSwapCount}).`);
                    next();
                    return;
                }

                console.log('Saving hashes for each organization');
                _.each(this.organizations, (organization) => {
                    let data = '';

                    _.each(organization.received, (submission) => {
                        data += submission.hash + '\n';
                    });

                    fs.writeFileSync(path.join(__dirname, `../../output/hashes-${organization.sources[0]}.csv`), data);
                });

                let summary = this.getSummary();
                fs.writeFileSync(path.join(__dirname, `../../output/summary.csv`), summary);

                console.log('-------');
                console.log(summary);
                console.log('-------');

                next();
            },
        ], next);
    }

    getSwapCount() {
        return _.sum(this.organizations, (organization) => {
            return organization.received.length;
        });
    }

    getSummary() {
        let summary = 'ORG,SWAPPED,UNSOURCED,TOTAL\n';
        _.each(this.organizations, (organization) => {
            let keyCount = organization.received.length;
            summary += `${organization.sources[0]},${keyCount - organization.freeCount},${organization.freeCount},${keyCount}\n`;
        });

        return summary;
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
