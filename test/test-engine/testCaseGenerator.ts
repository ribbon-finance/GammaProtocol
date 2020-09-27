/**
 *
 * TEST ENGINE PARAMETERS
 *
 */
const maxStrikePrice = 5000
const maxStrikeWidth = 5000
const minStrikePrice = 0

const maxAmount = 5000
const maxAmountDifference = 5000
const minAmount = 0

const maxCollateral = 10000
const minCollateral = 0

const minSpot = 0
const maxSpot = 100000000000

/**
 *
 * TEST ENGINE RULES
 *
 */

enum strikePriceRule {
  longLessThanShort,
  longMoreThanShort,
  longEqualShort,
}

enum amountRule {
  longLessThanShort,
  longMoreThanShort,
  longEqualShort,
  onlyShort,
  onlyLong,
}

enum collateralRules {
  insufficient,
  exact,
  excess,
}

enum spotPriceRules {
  spotHighest,
  spotEqualHigherStrike,
  spotInBetweenStrikes,
  spotEqualLowerStrike,
  spotLowest,
}

/**
 *
 * HELPER INTERFACES
 *
 */

interface StrikePrices {
  longStrike: number
  shortStrike: number
}

interface Amounts {
  longAmount: number
  shortAmount: number
}

export interface Test {
  shortAmount: number
  longAmount: number
  shortStrike: number
  longStrike: number
  collateral: number
  netValue: number
  isExcess: boolean
  oraclePrice: number
}

export interface Tests {
  beforeExpiryPuts: Test[]
  afterExpiryPuts: Test[]
}

/**
 *
 *  HELPER FUNCTIONS
 *
 */

/**
 * Return a random integer from 1 to the max number passed in.
 * @param max
 */
function getRandomInt(max: number) {
  return Math.min(Math.floor(Math.random() * Math.floor(max)) + 1, max)
}

/**
 * Generate a pair of strike prices based on the strike price rule passed in
 * @param rule
 */
function strikePriceGenerator(rule: strikePriceRule): StrikePrices {
  let longStrike = 0
  const shortStrike = getRandomInt(maxStrikePrice)
  const strikeWidth = getRandomInt(maxStrikeWidth)

  if (rule == strikePriceRule.longLessThanShort) {
    longStrike = Math.max(shortStrike - strikeWidth, minStrikePrice)
  } else if (rule == strikePriceRule.longMoreThanShort) {
    longStrike = Math.min(shortStrike + strikeWidth, maxStrikePrice)
  } else {
    longStrike = shortStrike
  }

  return {
    longStrike,
    shortStrike,
  }
}

/**
 * Generate a pair of integer amounts based on the amount rule passed in
 * @param rule
 */
function amountGenerator(rule: amountRule): Amounts {
  let longAmount = 0
  let shortAmount = getRandomInt(maxStrikePrice)
  const strikeWidth = getRandomInt(maxStrikeWidth)

  if (rule == amountRule.longLessThanShort) {
    longAmount = Math.max(shortAmount - strikeWidth, minAmount)
  } else if (rule == amountRule.longMoreThanShort) {
    longAmount = Math.min(shortAmount + strikeWidth, maxAmount)
  } else if (rule == amountRule.onlyShort) {
    longAmount = 0
  } else if (rule == amountRule.onlyLong) {
    longAmount = shortAmount
    shortAmount = 0
  } else {
    longAmount = shortAmount
  }

  return {
    longAmount,
    shortAmount,
  }
}

/**
 * Calculate the expected put margin required before expiry for a given vault
 * @param strikePrices The strike prices of the short and long option
 * @param amounts The amount of the short and the long option
 */
function putMarginRequiredBeforeExpiry(strikePrices: StrikePrices, amounts: Amounts): number {
  const netValue =
    strikePrices.shortStrike * amounts.shortAmount -
    strikePrices.longStrike * Math.min(amounts.shortAmount, amounts.longAmount)
  return Math.max(0, netValue)
}

/**
 * Calculate the expected put margin required after expiry for a given vault
 * @param strikePrices The strike prices of the short and long option
 * @param amounts The amount of the short and the long option
 */
function putMarginRequiredAfterExpiry(spotPrice: number, strikePrices: StrikePrices, amounts: Amounts): number {
  const longCashValue = Math.max(0, strikePrices.longStrike - spotPrice) * amounts.longAmount
  const shortCashValue = Math.max(0, strikePrices.shortStrike - spotPrice) * amounts.shortAmount

  return shortCashValue - longCashValue
}

/**
 * TEST CASE GENERATORS
 * The following functions are where the math calculations on expected test case results happen
 */

/**
 * Create a test for a vault with put options which have expired
 * @param rule The rule on what the spot price of the option is
 * @param strikePrices The strike prices of the short and long option in the vault
 * @param amounts The amount of the short and the long option in the vault
 * @param collateral The amount of collateral in the vault
 */
function putAfterExpiryTestCreator(
  rule: spotPriceRules,
  strikePrices: StrikePrices,
  amounts: Amounts,
  collateral: number,
): Test {
  const highStrike = Math.max(strikePrices.shortStrike, strikePrices.longStrike)
  const lowStrike = Math.min(strikePrices.shortStrike, strikePrices.longStrike)
  let spotPrice = 0

  if (rule == spotPriceRules.spotHighest) {
    spotPrice = Math.min(getRandomInt(maxSpot) + highStrike, maxSpot)
  } else if (rule == spotPriceRules.spotEqualHigherStrike) {
    spotPrice = highStrike
  } else if (rule == spotPriceRules.spotInBetweenStrikes) {
    const spotPriceDifference = highStrike - lowStrike
    spotPrice = getRandomInt(spotPriceDifference) + lowStrike
  } else if (rule == spotPriceRules.spotEqualLowerStrike) {
    spotPrice = lowStrike
  } else if (rule == spotPriceRules.spotLowest) {
    spotPrice = Math.max(getRandomInt(lowStrike), minSpot)
  }
  const netValue = collateral - putMarginRequiredAfterExpiry(spotPrice, strikePrices, amounts)

  return {
    shortAmount: amounts.shortAmount,
    longAmount: amounts.longAmount,
    shortStrike: strikePrices.shortStrike,
    longStrike: strikePrices.longStrike,
    collateral: collateral,
    netValue: netValue,
    isExcess: true,
    oraclePrice: spotPrice,
  }
}

/**
 * Create a test for a vault with put options which have not expired
 * @param rule The rule on how much collateral there should be in the vault
 * @param strikePrices The strike prices of the short and long option in the vault
 * @param amounts The amount of the short and the long option in the vault
 */
function putBeforExpiryTestCreator(rule: collateralRules, strikePrices: StrikePrices, amounts: Amounts): Test {
  const marginRequired = putMarginRequiredBeforeExpiry(strikePrices, amounts)
  let collateral = marginRequired

  if (rule == collateralRules.insufficient) {
    const amountToRemove = getRandomInt(collateral)
    collateral = Math.max(minCollateral, collateral - amountToRemove)
  } else if (rule == collateralRules.excess) {
    const excess = getRandomInt(maxCollateral)
    collateral = Math.min(maxCollateral, collateral + excess)
  }

  const netValue = collateral - marginRequired
  const isExcess = netValue >= 0

  return {
    shortAmount: amounts.shortAmount,
    longAmount: amounts.longAmount,
    shortStrike: strikePrices.shortStrike,
    longStrike: strikePrices.longStrike,
    collateral: collateral,
    netValue: Math.abs(netValue),
    isExcess: isExcess,
    oraclePrice: 0,
  }
}

/**
 * Create an series of tests for all the various rules specified based on the parameters specified.
 * Return an array of tests for puts before expiry, puts after expiry.
 */

export function testCaseGenerator(): Tests {
  const putTestsBeforeExpiry: Test[] = []
  const putTestsAfterExpiry: Test[] = []

  for (let i = 0; i < Object.keys(strikePriceRule).length / 2; i++) {
    for (let j = 0; j < Object.keys(amountRule).length / 2; j++) {
      for (let k = 0; k < Object.keys(collateralRules).length / 2; k++) {
        const testStrikes = strikePriceGenerator(i)
        const testAmounts = amountGenerator(j)
        let test = putBeforExpiryTestCreator(k, testStrikes, testAmounts)
        putTestsBeforeExpiry.push(test)
        if (collateralRules.exact == k) {
          for (let l = 0; l < Object.keys(spotPriceRules).length / 2; l++) {
            test = putAfterExpiryTestCreator(l, testStrikes, testAmounts, test.collateral)
            putTestsAfterExpiry.push(test)
          }
        }
      }
    }
  }

  return {
    beforeExpiryPuts: putTestsBeforeExpiry,
    afterExpiryPuts: putTestsAfterExpiry,
  }
}

/** ERROR REPORTING HELPERS */

/**
 * Return an error message to be emitted for the passed in test
 * @param test The generated test case
 */
export function testToString(test: Test): string {
  const strikePrice =
    '\n Long Strike = $' + test.longStrike.toString() + '\n Short Strike = $' + test.shortStrike.toString()
  const amount = '\n Long Amount = ' + test.longAmount.toString() + '\n Short Amount = ' + test.shortAmount.toString()
  const collateral = '\n Collateral = ' + test.collateral.toString()
  const oraclePrice = test.oraclePrice > 0 ? '\n Oracle Price = ' + test.oraclePrice.toString() : ''
  const expectedResult =
    '\n\n EXPECTED RESULT: \n\n netValue = ' + test.netValue.toString() + '\n isExcess = ' + test.isExcess.toString()
  return '\n TEST FAILED: \n' + strikePrice + amount + collateral + oraclePrice + expectedResult + '\n \n'
}