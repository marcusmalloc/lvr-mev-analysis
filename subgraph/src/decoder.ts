import { BigInt, Bytes } from "@graphprotocol/graph-ts"

export class PairInfo {
  asset0: Bytes
  asset1: Bytes

  constructor(asset0: Bytes, asset1: Bytes) {
    this.asset0 = asset0
    this.asset1 = asset1
  }
}

export class TopOfBlockData {
  pairIndex: i32
  zeroForOne: bool
  quantityIn: BigInt
  quantityOut: BigInt
  maxGasAsset0: BigInt
  gasUsedAsset0: BigInt

  constructor(
    pairIndex: i32,
    zeroForOne: bool,
    quantityIn: BigInt,
    quantityOut: BigInt,
    maxGasAsset0: BigInt,
    gasUsedAsset0: BigInt
  ) {
    this.pairIndex = pairIndex
    this.zeroForOne = zeroForOne
    this.quantityIn = quantityIn
    this.quantityOut = quantityOut
    this.maxGasAsset0 = maxGasAsset0
    this.gasUsedAsset0 = gasUsedAsset0
  }
}

export class PoolUpdateData {
  pairIndex: i32
  zeroForOne: bool
  rewardAmount: BigInt

  constructor(pairIndex: i32, zeroForOne: bool, rewardAmount: BigInt) {
    this.pairIndex = pairIndex
    this.zeroForOne = zeroForOne
    this.rewardAmount = rewardAmount
  }
}

export class UserOrderData {
  pairIndex: i32

  constructor(pairIndex: i32) {
    this.pairIndex = pairIndex
  }
}

export class DecodedBundle {
  pairs: Array<PairInfo>
  topOfBlockOrders: Array<TopOfBlockData>
  poolUpdates: Array<PoolUpdateData>
  userOrders: Array<UserOrderData>

  constructor(
    pairs: Array<PairInfo>,
    topOfBlockOrders: Array<TopOfBlockData>,
    poolUpdates: Array<PoolUpdateData>,
    userOrders: Array<UserOrderData>
  ) {
    this.pairs = pairs
    this.topOfBlockOrders = topOfBlockOrders
    this.poolUpdates = poolUpdates
    this.userOrders = userOrders
  }
}

class BinaryDecoder {
  data: Bytes
  pos: i32

  constructor(data: Bytes) {
    this.data = data
    this.pos = 0
  }

  readU8(): u8 {
    if (this.pos >= this.data.length) {
      return 0
    }
    return this.data[this.pos++]
  }

  readU16(): i32 {
    let a = this.readU8()
    let b = this.readU8()
    return ((a as i32) << 8) | (b as i32)
  }

  readU24(): i32 {
    let a = this.readU8()
    let b = this.readU8()
    let c = this.readU8()
    return ((a as i32) << 16) | ((b as i32) << 8) | (c as i32)
  }

  readBytes(length: i32): Bytes {
    let out = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      out[i] = this.readU8()
    }
    return changetype<Bytes>(out)
  }

  readUint(length: i32): BigInt {
    return bigIntFromBigEndian(this.readBytes(length))
  }

  skip(length: i32): void {
    this.pos += length
  }
}

function bigIntFromBigEndian(bytes: Bytes): BigInt {
  let reversed = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    reversed[i] = bytes[bytes.length - 1 - i]
  }
  return BigInt.fromUnsignedBytes(changetype<Bytes>(reversed))
}

function skipSignature(decoder: BinaryDecoder, isEcdsa: bool): void {
  if (isEcdsa) {
    decoder.skip(65)
    return
  }

  decoder.skip(20)
  let signatureLength = decoder.readU24()
  decoder.skip(signatureLength)
}

function readAssets(decoder: BinaryDecoder): Array<Bytes> {
  let assetBytes = decoder.readU24()
  let assetCount = assetBytes / 68
  let assets = new Array<Bytes>()

  for (let i = 0; i < assetCount; i++) {
    assets.push(decoder.readBytes(20))
    decoder.skip(48)
  }

  return assets
}

function readPairs(decoder: BinaryDecoder, assets: Array<Bytes>): Array<PairInfo> {
  let pairBytes = decoder.readU24()
  let pairCount = pairBytes / 38
  let pairs = new Array<PairInfo>()

  for (let i = 0; i < pairCount; i++) {
    let index0 = decoder.readU16()
    let index1 = decoder.readU16()
    decoder.skip(34)

    let asset0 = index0 < assets.length ? assets[index0] : ZERO_ADDRESS
    let asset1 = index1 < assets.length ? assets[index1] : ZERO_ADDRESS
    pairs.push(new PairInfo(asset0, asset1))
  }

  return pairs
}

function readPoolUpdates(decoder: BinaryDecoder): Array<PoolUpdateData> {
  let totalBytes = decoder.readU24()
  let end = decoder.pos + totalBytes
  let poolUpdates = new Array<PoolUpdateData>()

  while (decoder.pos < end) {
    let flags = decoder.readU8()
    let pairIndex = decoder.readU16()
    let zeroForOne = (flags & 1) != 0
    let currentOnly = (flags & 2) != 0

    decoder.skip(16)

    let rewardAmount = BigInt.fromI32(0)
    if (currentOnly) {
      rewardAmount = decoder.readUint(16)
      decoder.skip(16)
    } else {
      decoder.skip(3)
      decoder.skip(16)
      let quantityBytes = decoder.readU24()
      let quantityCount = quantityBytes / 16

      for (let i = 0; i < quantityCount; i++) {
        rewardAmount = rewardAmount.plus(decoder.readUint(16))
      }

      decoder.skip(20)
    }

    poolUpdates.push(new PoolUpdateData(pairIndex, zeroForOne, rewardAmount))
  }

  return poolUpdates
}

function readTopOfBlockOrders(decoder: BinaryDecoder): Array<TopOfBlockData> {
  let totalBytes = decoder.readU24()
  let end = decoder.pos + totalBytes
  let orders = new Array<TopOfBlockData>()

  while (decoder.pos < end) {
    let flags = decoder.readU8()
    let zeroForOne = (flags & 2) != 0
    let hasRecipient = (flags & 4) != 0
    let isEcdsa = (flags & 8) != 0

    let quantityIn = decoder.readUint(16)
    let quantityOut = decoder.readUint(16)
    let maxGasAsset0 = decoder.readUint(16)
    let gasUsedAsset0 = decoder.readUint(16)
    let pairIndex = decoder.readU16()

    if (hasRecipient) {
      decoder.skip(20)
    }

    skipSignature(decoder, isEcdsa)

    orders.push(
      new TopOfBlockData(
        pairIndex,
        zeroForOne,
        quantityIn,
        quantityOut,
        maxGasAsset0,
        gasUsedAsset0
      )
    )
  }

  return orders
}

function readUserOrders(decoder: BinaryDecoder): Array<UserOrderData> {
  let totalBytes = decoder.readU24()
  let end = decoder.pos + totalBytes
  let orders = new Array<UserOrderData>()

  while (decoder.pos < end) {
    let flags = decoder.readU8()
    let hasRecipient = (flags & 2) != 0
    let hasHook = (flags & 4) != 0
    let hasStandingValidation = (flags & 16) != 0
    let partial = (flags & 32) != 0
    let isEcdsa = (flags & 128) != 0

    decoder.skip(4)
    let pairIndex = decoder.readU16()
    decoder.skip(32)

    if (hasRecipient) {
      decoder.skip(20)
    }

    if (hasHook) {
      let hookLength = decoder.readU24()
      decoder.skip(hookLength)
    }

    if (hasStandingValidation) {
      decoder.skip(13)
    }

    decoder.skip(partial ? 48 : 16)
    decoder.skip(32)
    skipSignature(decoder, isEcdsa)

    orders.push(new UserOrderData(pairIndex))
  }

  return orders
}

export const ZERO_ADDRESS = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000"
) as Bytes

export function decodeBundle(encoded: Bytes): DecodedBundle | null {
  if (encoded.length == 0) {
    return null
  }

  let decoder = new BinaryDecoder(encoded)
  let assets = readAssets(decoder)
  let pairs = readPairs(decoder, assets)
  let poolUpdates = readPoolUpdates(decoder)
  let topOfBlockOrders = readTopOfBlockOrders(decoder)
  let userOrders = readUserOrders(decoder)

  return new DecodedBundle(pairs, topOfBlockOrders, poolUpdates, userOrders)
}
