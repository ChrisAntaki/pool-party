# Pool Party

Pool Party allows you to run your own secure email swaps for free.

## Instructions

```sh
# 1) Install dependencies with NPM.
npm install

# 2) Start the swap.
. ./swap.sh
```

## Inputs

The `inputs/` directory has been filled with sample files. You'll want to replace these files before running your own swap.

### input/config.json
[This file](https://github.com/ChrisAntaki/pool-party/blob/master/input/config.json) defines which organizations, suppression lists, state preferences, and referral codes will be considered.

### input/suppression/organization_a.csv
[This file](https://github.com/ChrisAntaki/pool-party/blob/master/input/suppression/organization_a.csv) defines a list of email hashes which Organization A is not interested in. All organizations participating in the swap ({"swapping": true}) should have at least one suppression list.

### input/submissions.csv
[This file](https://github.com/ChrisAntaki/pool-party/blob/master/input/submissions.csv) defines a list of signature events. Ideally, petitions will have an opt-out checkbox. If this is the case, then the "swappable" column should have a value of "constent" if the user is opted-in. Other columns include "state", which are considered when an organization prefers members from certain states. The other columns should be relatively self-explanatory, but perhaps it's worth expanding this documention to cover every field.
