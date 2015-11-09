'use strict';

// Modules
const _ = require('lodash');
const async = require('async');
const config = require('../../input/config');
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
        this.organizations = params.organizations;
        this.submissions = params.submissions;
        this.start();
    }

    start(next) {
        async.series([
            // Resetting instance variables
            (next) => {
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
                    organization.sourced = [];
                });

                _.each(this.submissions.hashes, (submission) => {
                    // Used to determine rarity of submission
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

                    _.each(_.keys(submission.sources), (source) => {
                        let organization = sourceMap[source];
                        if (organization) {
                            organization.sourced.push(submission);
                            submission.sourceObjects.push(organization);
                        }
                    });
                });

                next();
            },

            // Finding eligible hashes for each organization
            (next) => {
                console.log('Finding eligible hashes for each organization');
                // Creating eligibity arrays
                _.each(this.organizations, (organization) => {
                    organization.eligible.free = [];

                    _.each(this.organizations, (otherOrganization) => {
                        if (organization === otherOrganization) {
                            return;
                        }

                        organization.eligible[otherOrganization.sources[0]] = [];
                    });
                });

                // Assigning eligiblity to submissions
                _.each(this.submissions.hashes, (submission) => {
                    _.each(this.organizations, (organization) => {
                        // Skip suppressed hashes
                        if (organization.hashes[submission.hash]) {
                            return;
                        }

                        // Used to determine rarity of submission
                        submission.eligible.push(organization);
                    });
                });

                next();
            },

            // Sort submissions by eligibility
            // Most common to most rare
            (next) => {
                this.submissions.hashes.sort((a, b) => a.eligible.length - b.eligible.length);

                next();
            },

            // Assigning eligiblity to organizations
            (next) => {
                console.log('Assigning eligiblity to organizations');
                _.each(this.submissions.hashes, (submission) => {
                    let isFree = submission.sourceObjects.length === 0;

                    _.each(submission.eligible, (organization) => {
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

                next();
            },

            // Swap V2
            (next) => {
                this.swap(next);
            },

            // Distributing free submissions
            (next) => {
                this.distributeUnsourcedSubmissions(next);
            },

            // Save
            (next) => {
                let count = this.getSwapCount();
                console.log(`${count} names were swapped!`);

                let id = 1;
                let csv = 'id,hash,group\n';

                console.log('Saving hashes for each organization');
                _.each(this.organizations, (organization) => {
                    _.each(organization.received, (submission) => {
                        csv += `${id++},${submission.hash},${organization.sources[0]}\n`;
                    });
                });

                fs.writeFileSync(path.join(__dirname, `../../output/hashes.csv`), csv);

                let summary = this.getSummary();
                fs.writeFileSync(path.join(__dirname, `../../output/summary.csv`), summary);

                next();
            },
        ], next);
    }

    swap(next) {
        console.log('Starting swap');
        async.forever((next) => {
            let success = false;

            let owedOrganizations = this.getSortedListOfOwedOrganizations();
            let givingOrganizations = this.getListOfGivingOrganizations();

            _.each(owedOrganizations, (owedOrganization) => {
                // Find the most common submission
                let mostCommonSubmission;
                let mostCommonSubmissionOwner;
                _.each(givingOrganizations, (givingOrganization) => {
                    let submission = owedOrganization.requestSubmission({
                        from: givingOrganization,
                        given: this.given,
                    });

                    if (
                        submission
                        &&
                        (
                            !mostCommonSubmission
                            ||
                            mostCommonSubmission.eligible.length > submission.eligible.length
                        )
                    ) {
                        mostCommonSubmission = submission;
                        mostCommonSubmissionOwner = givingOrganization;
                    }
                });

                if (mostCommonSubmission) {
                    mostCommonSubmissionOwner.giveSubmission({
                        given: this.given,
                        submission: mostCommonSubmission,
                        to: owedOrganization,
                    });

                    success = true;
                }

                // If there was a match, break the loop
                if (success) {
                    return false;
                }
            });

            next(!success);
        }, () => {
            console.log('Trading has completed');
            next();
        });
    }

    distributeUnsourcedSubmissions(next) {
        console.log('Distributing unsourced submissions');
        let organizations = _.clone(this.organizations);

        async.forever((next) => {
            // Check if every organization has bounced
            if (_.isEmpty(organizations)) {
                next(1);
                return;
            }

            // Find the organization who has taken the least free submissions
            let organization = _.min(organizations, organization => organization.received.length / organization.sourced.length);

            let submission = organization.requestSubmission({
                free: true,
                given: this.given,
            });

            if (!submission) {
                _.pull(organizations, organization);
                next();
                return;
            }

            organization.takeFreeSubmission({
                given: this.given,
                submission: submission,
            });

            next();
        }, (err) => {
            next();
        });
    }

    getSwapCount() {
        return _.sum(this.organizations, (organization) => {
            return organization.received.length;
        });
    }

    getSummary() {
        let summary = 'Organization,Sourced,Received,Percent,(Sourced),(Unsourced)\n';
        _.each(this.organizations, (organization) => {
            let name = organization.name;
            let sourced = organization.sourced.length;
            let receivedTotal = organization.received.length;
            let percent = ((receivedTotal / sourced) * 100).toFixed(2);
            let receivedUnsourced = organization.freeCount;
            let receivedSourced = receivedTotal - receivedUnsourced;
            summary += `${name},${sourced},${receivedTotal},${percent}%,${receivedSourced},${receivedUnsourced}\n`;
        });

        return summary;
    }

    getListOfGivingOrganizations() {
        return _.filter(this.organizations, (organization) => {
            return organization.given.length <= organization.received.length;
        });
    }

    getSortedListOfOwedOrganizations() {
        return _.filter(this.organizations, (organization) => {
            return (
                organization.given.length >= organization.received.length
            );
        }).sort((a, b) => {
            // Sort those who have given more than they've received first
            let scoreA = a.given.length - a.received.length;
            let scoreB = b.given.length - b.received.length;

            // Sort those who have more unpayed sourced actions first
            if (scoreA === scoreB) {
                scoreA = a.sourced.length - a.received.length;
                scoreB = b.sourced.length - b.received.length;
            }

            return scoreB - scoreA;
        });
    }

}
