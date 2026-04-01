import { BigInt, Bytes, Entity, Value, store } from "@graphprotocol/graph-ts"
import { decodeBundle, PairInfo, ZERO_ADDRESS } from "./decoder"
import { ExecuteCall } from "./types"

function ensureI32(values: Array<i32>, index: i32): void {
  while (values.length <= index) {
    values.push(0)
  }
}

function ensureBool(values: Array<bool>, index: i32): void {
  while (values.length <= index) {
    values.push(false)
  }
}

function ensureBigInt(values: Array<BigInt>, index: i32): void {
  while (values.length <= index) {
    values.push(BigInt.fromI32(0))
  }
}

function countFor(values: Array<i32>, index: i32): i32 {
  if (index >= values.length) {
    return 0
  }
  return values[index]
}

function pairFor(pairs: Array<PairInfo>, index: i32): PairInfo | null {
  if (index < 0 || index >= pairs.length) {
    return null
  }
  return pairs[index]
}

function saveBundle(id: string, hash: Bytes, blockNumber: BigInt, timestamp: BigInt, tobCount: i32, userCount: i32): void {
  let entity = new Entity()
  entity.set("id", Value.fromString(id))
  entity.set("transactionHash", Value.fromBytes(hash))
  entity.set("blockNumber", Value.fromBigInt(blockNumber))
  entity.set("timestamp", Value.fromBigInt(timestamp))
  entity.set("tobOrderCount", Value.fromBigInt(BigInt.fromI32(tobCount)))
  entity.set("userOrderCount", Value.fromBigInt(BigInt.fromI32(userCount)))
  store.set("Bundle", id, entity)
}

function savePoolUpdate(bundleId: string, index: i32, pairIndex: i32, zeroForOne: bool, rewardAmount: BigInt): void {
  let id = bundleId + "-poolupdate-" + index.toString()
  let entity = new Entity()
  entity.set("id", Value.fromString(id))
  entity.set("bundle", Value.fromString(bundleId))
  entity.set("updateIndex", Value.fromBigInt(BigInt.fromI32(index)))
  entity.set("pairIndex", Value.fromBigInt(BigInt.fromI32(pairIndex)))
  entity.set("zeroForOne", Value.fromBoolean(zeroForOne))
  entity.set("rewardAmount", Value.fromBigInt(rewardAmount))
  store.set("PoolUpdate", id, entity)
}

function saveUserOrder(bundleId: string, index: i32, pairIndex: i32): void {
  let id = bundleId + "-user-" + index.toString()
  let entity = new Entity()
  entity.set("id", Value.fromString(id))
  entity.set("bundle", Value.fromString(bundleId))
  entity.set("orderIndex", Value.fromBigInt(BigInt.fromI32(index)))
  entity.set("pairIndex", Value.fromBigInt(BigInt.fromI32(pairIndex)))
  store.set("UserOrder", id, entity)
}

function saveTopOfBlockOrder(
  bundleId: string,
  index: i32,
  pairIndex: i32,
  zeroForOne: bool,
  pairAsset0: Bytes,
  pairAsset1: Bytes,
  quantityIn: BigInt,
  quantityOut: BigInt,
  maxGasAsset0: BigInt,
  gasUsedAsset0: BigInt,
  attributionStatus: string,
  hasTobOnlyLpPaymentAsset0: bool,
  tobOnlyLpPaymentAsset0: BigInt
): void {
  let id = bundleId + "-tob-" + index.toString()
  let entity = new Entity()
  entity.set("id", Value.fromString(id))
  let assetIn = pairAsset0
  let assetOut = pairAsset1
  if (!zeroForOne) {
    assetIn = pairAsset1
    assetOut = pairAsset0
  }
  entity.set("bundle", Value.fromString(bundleId))
  entity.set("orderIndex", Value.fromBigInt(BigInt.fromI32(index)))
  entity.set("pairIndex", Value.fromBigInt(BigInt.fromI32(pairIndex)))
  entity.set("zeroForOne", Value.fromBoolean(zeroForOne))
  entity.set("assetIn", Value.fromBytes(assetIn))
  entity.set("assetOut", Value.fromBytes(assetOut))
  entity.set("pairAsset0", Value.fromBytes(pairAsset0))
  entity.set("pairAsset1", Value.fromBytes(pairAsset1))
  entity.set("quantityIn", Value.fromBigInt(quantityIn))
  entity.set("quantityOut", Value.fromBigInt(quantityOut))
  entity.set("maxGasAsset0", Value.fromBigInt(maxGasAsset0))
  entity.set("gasUsedAsset0", Value.fromBigInt(gasUsedAsset0))
  entity.set("attributionStatus", Value.fromString(attributionStatus))

  if (hasTobOnlyLpPaymentAsset0) {
    entity.set("tobOnlyLpPaymentAsset0", Value.fromBigInt(tobOnlyLpPaymentAsset0))
  }

  store.set("TopOfBlockOrder", id, entity)
}

export function handleExecute(call: ExecuteCall): void {
  if (call.inputs.encoded.length == 0) {
    return
  }

  let bundle = decodeBundle(call.inputs.encoded)
  if (bundle == null) {
    return
  }

  let bundleId = call.transaction.hash.toHexString()
  let tobCounts = new Array<i32>()
  let poolCounts = new Array<i32>()
  let userCounts = new Array<i32>()
  let poolDirections = new Array<bool>()
  let poolRewards = new Array<BigInt>()

  for (let i = 0; i < bundle.poolUpdates.length; i++) {
    let poolUpdate = bundle.poolUpdates[i]
    ensureI32(poolCounts, poolUpdate.pairIndex)
    ensureBool(poolDirections, poolUpdate.pairIndex)
    ensureBigInt(poolRewards, poolUpdate.pairIndex)

    poolCounts[poolUpdate.pairIndex] += 1
    if (poolCounts[poolUpdate.pairIndex] == 1) {
      poolDirections[poolUpdate.pairIndex] = poolUpdate.zeroForOne
      poolRewards[poolUpdate.pairIndex] = poolUpdate.rewardAmount
    }

    savePoolUpdate(bundleId, i, poolUpdate.pairIndex, poolUpdate.zeroForOne, poolUpdate.rewardAmount)
  }

  for (let i = 0; i < bundle.userOrders.length; i++) {
    let userOrder = bundle.userOrders[i]
    ensureI32(userCounts, userOrder.pairIndex)
    userCounts[userOrder.pairIndex] += 1
    saveUserOrder(bundleId, i, userOrder.pairIndex)
  }

  for (let i = 0; i < bundle.topOfBlockOrders.length; i++) {
    let topOfBlockOrder = bundle.topOfBlockOrders[i]
    ensureI32(tobCounts, topOfBlockOrder.pairIndex)
    tobCounts[topOfBlockOrder.pairIndex] += 1
  }

  saveBundle(
    bundleId,
    call.transaction.hash,
    call.block.number,
    call.block.timestamp,
    bundle.topOfBlockOrders.length,
    bundle.userOrders.length
  )

  for (let i = 0; i < bundle.topOfBlockOrders.length; i++) {
    let topOfBlockOrder = bundle.topOfBlockOrders[i]
    let pair = pairFor(bundle.pairs, topOfBlockOrder.pairIndex)
    let pairAsset0 = ZERO_ADDRESS
    let pairAsset1 = ZERO_ADDRESS
    if (pair != null) {
      pairAsset0 = pair.asset0
      pairAsset1 = pair.asset1
    }

    let attributionStatus = "matched"
    let hasTobOnlyLpPaymentAsset0 = false
    let tobOnlyLpPaymentAsset0 = BigInt.fromI32(0)

    if (countFor(userCounts, topOfBlockOrder.pairIndex) > 0) {
      attributionStatus = "ambiguous_user_order_same_pair"
    } else if (countFor(tobCounts, topOfBlockOrder.pairIndex) > 1) {
      attributionStatus = "ambiguous_multiple_tob_same_pair"
    } else if (countFor(poolCounts, topOfBlockOrder.pairIndex) == 0) {
      attributionStatus = "missing_pool_update"
    } else if (countFor(poolCounts, topOfBlockOrder.pairIndex) > 1) {
      attributionStatus = "ambiguous_multiple_pool_updates_same_pair"
    } else if (poolDirections[topOfBlockOrder.pairIndex] != topOfBlockOrder.zeroForOne) {
      attributionStatus = "direction_mismatch"
    } else {
      hasTobOnlyLpPaymentAsset0 = true
      tobOnlyLpPaymentAsset0 = poolRewards[topOfBlockOrder.pairIndex]
    }

    saveTopOfBlockOrder(
      bundleId,
      i,
      topOfBlockOrder.pairIndex,
      topOfBlockOrder.zeroForOne,
      pairAsset0,
      pairAsset1,
      topOfBlockOrder.quantityIn,
      topOfBlockOrder.quantityOut,
      topOfBlockOrder.maxGasAsset0,
      topOfBlockOrder.gasUsedAsset0,
      attributionStatus,
      hasTobOnlyLpPaymentAsset0,
      tobOnlyLpPaymentAsset0
    )
  }
}
