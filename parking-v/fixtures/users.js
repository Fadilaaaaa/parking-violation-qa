// fixtures/users.js

const USERS = {
  officer: {
    email: 'officer1@portal.test',
    password: 'password',
  },
  member: {
    email: 'member1@portal.test',
    password: 'password',
  },
};

const VIOLATION = {
  validPlate: 'B 3456 CDE',
  validType: 'no_parking_zone',
  validLocation: 'Jl. Sudirman No. 1',
  validOccurredAt: '2026-05-12T10:00', // siang hari → time multiplier 1.0
  nightOccurredAt: '2026-05-12T23:00', // malam → time multiplier 1.5
};

module.exports = { USERS, VIOLATION };
