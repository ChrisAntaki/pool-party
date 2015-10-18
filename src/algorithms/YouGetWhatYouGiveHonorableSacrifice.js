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
                    organization.sacrificing = false;
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

            // Repayments
            (next) => {
                _.each(config.sourcesToRepay, (sourceObj) => {
                    let repayedCount = 0;

                    let organization = _.find(this.organizations, (organization) => {
                        return sourceObj.source === organization.sources[0];
                    });

                    // Source unsourced submissions, from the recipient's suppression list
                    _.each(this.submissions.hashes, (submission) => {
                        if (
                            organization.hashes[submission.hash]
                            &&
                            submission.sourceObjects.length === 0
                        ) {
                            organization.sourced.push(submission);
                            submission.sourceObjects.push(organization);
                            repayedCount++;
                        }

                        if (sourceObj.amount <= repayedCount) {
                            return false;
                        }
                    });

                    console.log(`Repayed ${repayedCount} to ${organization.name}`);
                });

                next();
            },

            // Destroy remaining unsourced submissions
            (next) => {
                if (!config.destroyUnsourcedSubmissions) {
                    next();
                    return;
                }

                let indexesToRemove = [];

                _.each(this.submissions.hashes, (submission, index) => {
                    if (submission.sourceObjects.length === 0) {
                        indexesToRemove.push(index);
                    }
                });

                console.log(`Destroying ${indexesToRemove.length} unsourced submissions`);

                _.pullAt(this.submissions.hashes, indexesToRemove);

                next();
            },

            // Honorable sacrifice
            (next) => {
                let sacrificers = _.filter(
                    this.organizations,
                    (organization) => _.includes(config.sourcesToSacrifice, organization.sources[0])
                );

                if (sacrificers.length === 0) {
                    next();
                    return;
                }

                _.each(sacrificers, (sacrificer) => {
                    sacrificer.sacrificing = true;

                    // Remove all references to sourceObjects
                    let count = 0;

                    _.each(this.submissions.hashes, (submission, index) => {
                        if (_.includes(submission.sourceObjects, sacrificer)) {
                            _.pull(submission.sourceObjects, sacrificer);
                            count++;
                        }

                    });

                    console.log(`${sacrificer.name} sacrificed a source from ${count} submissions.`);
                });

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

                console.log('Saving hashes for each organization');
                _.each(this.organizations, (organization) => {
                    if (organization.sacrificing) {
                        return;
                    }

                    let data = '';

                    _.each(organization.received, (submission) => {
                        data += submission.hash + '\n';
                    });

                    fs.writeFileSync(path.join(__dirname, `../../output/hashes-${organization.sources[0]}.csv`), data);
                });

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
        let validOrganizations = _.filter(this.organizations, (organization) => !organization.sacrificing);

        async.forever((next) => {
            // Check if every organization has bounced
            if (_.isEmpty(validOrganizations)) {
                next(1);
                return;
            }

            // Find the organization who has taken the least free submissions
            let organization = _.min(validOrganizations, organization => organization.received.length / organization.sourced.length);

            let submission = organization.requestSubmission({
                free: true,
                given: this.given,
            });

            if (!submission) {
                _.pull(validOrganizations, organization);
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
            if (organization.sacrificing) {
                return 0;
            }

            return organization.received.length;
        });
    }

    getSummary() {
        let summary = 'Organization,Owed,Received From Swap,Received From Sacrifice,Received Total\n';
        _.each(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return;
            }

            let keyCount = organization.received.length;
            summary += `${organization.name},${organization.sourced.length},${keyCount - organization.freeCount},${organization.freeCount},${keyCount}\n`;
        });

        return summary;
    }

    getListOfGivingOrganizations() {
        return _.filter(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return false;
            }

            return organization.given.length <= organization.received.length;
        });
    }

    getSortedListOfOwedOrganizations() {
        return _.filter(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return false;
            }

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
