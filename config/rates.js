const RATES = {
  paper: 8,
  cardboard: 7,
  plastic: 12,
  metal: 25,
  'e-waste': 15,
  other: 5
};

const CATEGORIES = Object.keys(RATES);

function getRate(category) {
  return RATES[category];
}

function calculatePoints(totalKg) {
  return Math.round(Number(totalKg) * 10);
}

module.exports = {
  RATES,
  CATEGORIES,
  getRate,
  calculatePoints
};
