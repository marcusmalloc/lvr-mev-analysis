import { Bytes, ethereum } from "@graphprotocol/graph-ts"

export class ExecuteCall extends ethereum.Call {
  get inputs(): ExecuteCall__Inputs {
    return new ExecuteCall__Inputs(this)
  }

  get outputs(): ExecuteCall__Outputs {
    return new ExecuteCall__Outputs(this)
  }
}

export class ExecuteCall__Inputs {
  private call: ExecuteCall

  constructor(call: ExecuteCall) {
    this.call = call
  }

  get encoded(): Bytes {
    return this.call.inputValues[0].value.toBytes()
  }
}

export class ExecuteCall__Outputs {
  private call: ExecuteCall

  constructor(call: ExecuteCall) {
    this.call = call
  }
}
