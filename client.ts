/**
 * Copyright © 2020 Atos Spain SA. All rights reserved.
 *
 * This file is part of `awrtc_signaling`.
 *
 * `awrtc_signaling` is free software: you can redistribute it and/or modify it
 * under the terms of BSD 3-Clause License.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT ANY WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT, IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE. See README file for the full disclaimer information and LICENSE
 * file for full license information in the project
 */

import WebSocket from 'ws'

import {ConnectionId, NetworkEvent, NetEventType} from './INetwork'


class ClientEvent extends Event
{
  connectionId: ConnectionId
  error: Error
  info: string
  messageData: Uint8Array
  rawData: any

  constructor(type: string, error: Error, connectionId: ConnectionId,
    info: string, messageData: Uint8Array, rawData: any)
  {
    super(error ? 'error' : type)

    this.error = error
    this.info = info
    this.messageData = messageData
    this.rawData = rawData
  }
}


export class Client extends EventTarget
{
  constructor(ws)
  {
    super()

    if(!(ws instanceof WebSocket)) ws = new WebSocket(ws)

    ws.binaryType = 'arraybuffer'

    ws.addEventListener('close', this.#onClose, {once: true})
    ws.addEventListener('error', this.#onError)
    ws.addEventListener('message', this.#onMessage)
    ws.addEventListener('open', this.#onOpen, {once: true})

    this.#ws = ws
  }


  //
  // Public API
  //

  disconnect(connectionId: ConnectionId)
  {
    if(this.#disconnect == null)
    {
      this.#send(NetEventType.Disconnected, connectionId)

      this.#disconnect = new Promise(resolve =>
        this.#disconnect_resolve = resolve
      )
    }

    return this.#disconnect
  }

  getVersion()
  {
    if(this.#version == null)
    {
      this.#send(NetEventType.MetaVersion)

      this.#version = new Promise(resolve => this.#version_resolve = resolve)
    }

    return this.#version
  }

  heartbeat()
  {
    if(this.#heartbeat == null)
    {
      this.#send(NetEventType.MetaHeartbeat)

      this.#heartbeat = new Promise(resolve =>
        this.#heartbeat_resolve = resolve
      )
    }

    return this.#heartbeat
  }

  sendReliableMessage(connectionId: ConnectionId, messageData: Uint8Array)
  {
    this.#send(NetEventType.ReliableMessageReceived, connectionId, messageData)
  }

  sendUnreliableMessage(connectionId: ConnectionId, messageData: Uint8Array)
  {
    this.#send(NetEventType.UnreliableMessageReceived, connectionId, messageData)
  }


  //
  // IBasicNetwork
  //

  Connect(connectionId: ConnectionId, address: string)
  {
    if(this.#newConnection == null)
    {
      this.#send(NetEventType.NewConnection, connectionId, address)

      this.#newConnection = new Promise((resolve, reject) => {
        this.#newConnection_resolve = resolve
        this.#newConnection_reject  = reject
      })
    }

    return this.#newConnection
  }

  StartServer(address: string)
  {
    if(this.#serverInitialized == null)
    {
      this.#send(NetEventType.ServerInitialized, null, address)

      this.#serverInitialized = new Promise((resolve, reject) => {
        this.#serverInitialized_resolve = resolve
        this.#serverInitialized_reject  = reject
      })
    }

    return this.#serverInitialized
  }

  StopServer()
  {
    if(this.#serverClosed == null)
    {
      this.#send(NetEventType.ServerClosed)

      this.#serverClosed = new Promise(resolve =>
        this.#serverClosed_resolve = resolve
      )
    }

    return this.#serverClosed
  }


  //
  // Private API
  //

  #disconnect
  #disconnect_resolve
  #heartbeat
  #heartbeat_resolve
  #newConnection
  #newConnection_resolve
  #newConnection_reject
  #serverClosed
  #serverClosed_resolve
  #serverInitialized
  #serverInitialized_resolve
  #serverInitialized_reject
  #version
  #version_resolve
  #ws

  #onClose = this.dispatchEvent.bind(this)
  #onError = this.dispatchEvent.bind(this)
  #onOpen  = this.dispatchEvent.bind(this)

  #onMessage = ({data}) =>
  {
    const {
      ConnectionId, Info, MessageData, RawData, Type
    } = NetworkEvent.fromByteArray(data)

    let error

    switch(Type)
    {
      case NetEventType.UnreliableMessageReceived:
      case NetEventType.ReliableMessageReceived:
      break

      case NetEventType.ServerInitialized:
        if(this.#serverInitialized_resolve)
        {
          this.#serverInitialized_resolve(RawData)

          this.#serverInitialized = null
          this.#serverInitialized_resolve = null
          this.#serverInitialized_reject = null

          return
        }

        error = true
      break

      case NetEventType.ServerInitFailed:
        if(this.#serverInitialized_reject)
        {
          this.#serverInitialized_reject(RawData)

          this.#serverInitialized = null
          this.#serverInitialized_resolve = null
          this.#serverInitialized_reject = null

          return
        }

        error = true
      break

      case NetEventType.ServerClosed:
        if(this.#serverClosed_resolve)
        {
          this.#serverClosed_resolve()

          this.#serverClosed = null
          this.#serverClosed_resolve = null

          return
        }

        error = true
      break

      case NetEventType.NewConnection:
        if(!RawData) break

        if(this.#newConnection_resolve)
        {
          this.#newConnection_resolve()

          this.#newConnection = null
          this.#newConnection_resolve = null
          this.#newConnection_reject = null

          return
        }

        error = true
      break

      case NetEventType.ConnectionFailed:
        if(this.#newConnection_reject)
        {
          this.#newConnection_reject()

          this.#newConnection = null
          this.#newConnection_resolve = null
          this.#newConnection_reject = null

          return
        }

        error = true
      break

      case NetEventType.Disconnected:
        if(RawData) break

        if(this.#disconnect_resolve)
        {
          this.#disconnect_resolve()

          this.#disconnect = null
          this.#disconnect_resolve = null

          return
        }

        error = true
      break

      case NetEventType.MetaVersion:
        if(this.#version_resolve)
        {
          this.#version_resolve(RawData)

          this.#version_resolve = null

          return
        }

        error = new Error(`Unexpected ${Type} message: '${RawData}'`)
      break

      case NetEventType.MetaHeartbeat:
        if(this.#heartbeat_resolve)
        {
          this.#heartbeat_resolve()

          this.#heartbeat = null
          this.#heartbeat_resolve = null
        }

        else
        {
          const msg = new Uint8Array(1);
          msg[0] = NetEventType.MetaHeartbeat;

          this.#ws.send(msg)
        }
        return

      default:
        error = new Error(`Unexpected message type: '${Type}'`)
    }

    if(error === true)
      error = new Error(`Unexpected ${Type} message: '${Info}'`)

    const event = new ClientEvent(NetEventType[Type], error,
      ConnectionId, Info, MessageData, RawData)

    this.dispatchEvent(event)
  }

  // TODO TypeScript don't support private methods
  //      https://github.com/denoland/deno/issues/5258
  #send = (type: NetEventType, conId?: ConnectionId, data?: any) =>
  {
    this.#ws.send(NetworkEvent.toByteArray(new NetworkEvent(type, conId, data)))
  }
}

export default Client
