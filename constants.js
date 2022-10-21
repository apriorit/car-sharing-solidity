const fs = require('fs');

let ALL_CONSTANTS = JSON.parse(fs.readFileSync('./env.json', 'utf8'));

const ACTIVE_CHAIN = process.env.ACTIVE_CHAIN ?? 'LOCAL';

let CONSTANTS = ALL_CONSTANTS[ACTIVE_CHAIN];

function saveConstants() {
  ALL_CONSTANTS[ACTIVE_CHAIN] = CONSTANTS;
  fs.writeFileSync('env.json', JSON.stringify(ALL_CONSTANTS, null, 2) + '\n', 'utf8');
}

module.exports = {
  ALL_CONSTANTS,
  CONSTANTS,
  saveConstants
};
